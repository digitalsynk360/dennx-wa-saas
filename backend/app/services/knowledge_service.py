"""
Knowledge Base pipeline — Phase 2 of the AI Hub.

  crawl_website()   fetch same-domain pages → clean → chunk → embed → store
  process_upload()  PDF / DOCX / TXT / CSV / MD → extract → chunk → embed → store
  reindex_all()     re-embed every chunk (e.g. after embedding model change)

Long-running work executes via FastAPI BackgroundTasks with its own DB
session; live progress is written to Redis under kb_status:{workspace_id}
so the frontend can poll without WebSockets.
"""
import asyncio
import hashlib
import io
import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx
import structlog
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select, text

from app.core.database import AsyncSessionLocal
from app.core.redis import redis_client
from app.models.platform import KnowledgeDocument
from app.services.ai_service import _get_embedding

logger = structlog.get_logger()

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150
STATUS_TTL = 3600  # 1h


# ─── Redis status helpers ────────────────────────────────────────────────

def _status_key(workspace_id: uuid.UUID) -> str:
    return f"kb_status:{workspace_id}"


async def _set_status(workspace_id: uuid.UUID, **fields) -> None:
    try:
        raw = await redis_client.get(_status_key(workspace_id))
        data = json.loads(raw) if raw else {}
        data.update(fields)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await redis_client.set(_status_key(workspace_id), json.dumps(data), ex=STATUS_TTL)
    except Exception as e:  # Redis down should never kill the pipeline
        logger.warning("kb_status_write_failed", error=str(e))

    # Push live progress to the AI Chatbot > Knowledge Base tab — this
    # replaces the 3s polling loop the frontend used to need.
    try:
        from app.websocket.manager import manager
        await manager.broadcast(str(workspace_id), "kb_task_update", data)
    except Exception as e:
        logger.warning("kb_status_broadcast_failed", error=str(e))


async def get_status(workspace_id: uuid.UUID) -> dict:
    try:
        raw = await redis_client.get(_status_key(workspace_id))
        return json.loads(raw) if raw else {"state": "idle"}
    except Exception:
        return {"state": "idle"}


# ─── Text utilities ──────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_WS_RE = re.compile(r"[ \t]+")
_NL_RE = re.compile(r"\n{3,}")


def html_to_text(html: str) -> str:
    html = _SCRIPT_RE.sub(" ", html)
    html = re.sub(r"<br\s*/?>|</p>|</div>|</h[1-6]>|</li>", "\n", html, flags=re.IGNORECASE)
    text = _TAG_RE.sub(" ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">")
                .replace("&#39;", "'").replace("&quot;", '"'))
    text = _WS_RE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.splitlines())
    return _NL_RE.sub("\n\n", text).strip()


def extract_title(html: str) -> str | None:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    return html_to_text(m.group(1))[:250] if m else None


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        # prefer breaking at a paragraph / sentence boundary
        if end < len(text):
            for sep in ("\n\n", ". ", "\n", " "):
                cut = text.rfind(sep, start + size // 2, end)
                if cut != -1:
                    end = cut + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def extract_links(html: str, base_url: str) -> list[str]:
    base = urlparse(base_url)
    links: list[str] = []
    for m in re.finditer(r'href=["\']([^"\'#]+)["\']', html, re.IGNORECASE):
        href = urljoin(base_url, m.group(1).strip())
        p = urlparse(href)
        if p.scheme in ("http", "https") and p.netloc == base.netloc:
            clean = f"{p.scheme}://{p.netloc}{p.path}".rstrip("/")
            if not re.search(r"\.(png|jpe?g|gif|svg|css|js|ico|pdf|zip|mp4|webp|woff2?)$", p.path, re.IGNORECASE):
                links.append(clean)
    return links


# ─── File extraction (PDF via pypdf, DOCX via stdlib zip) ────────────────

def extract_pdf(content: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)


def extract_docx(content: bytes) -> str:
    """DOCX = zip of XML — no python-docx dependency needed."""
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        xml = z.read("word/document.xml").decode("utf-8", errors="replace")
    xml = xml.replace("</w:p>", "\n")
    return html_to_text(xml)


def extract_file_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_pdf(content)
    if lower.endswith(".docx"):
        return extract_docx(content)
    # txt / csv / md / anything textual
    return content.decode("utf-8", errors="replace")


# ─── Store helper ────────────────────────────────────────────────────────

async def _embed_and_store(
    db, workspace_id: uuid.UUID, chunks: list[str],
    title: str | None, source: str, doc_type: str, extra_meta: dict | None = None,
) -> int:
    stored = 0
    for i, chunk in enumerate(chunks):
        try:
            embedding = await _get_embedding(chunk)
        except Exception as e:
            logger.error("kb_embed_failed", error=str(e))
            raise
        db.add(KnowledgeDocument(
            workspace_id=workspace_id,
            title=(f"{title} — part {i + 1}" if title and len(chunks) > 1 else title),
            content=chunk,
            source=source[:250],
            embedding=embedding,
            metadata_={"type": doc_type, "chunk_index": i, "total_chunks": len(chunks), **(extra_meta or {})},
        ))
        stored += 1
        if stored % 10 == 0:
            await db.flush()
            await _set_status(workspace_id, chunks_done=stored)
    await db.flush()
    return stored


# ─── Website crawler (background task) ───────────────────────────────────

async def crawl_website(workspace_id: uuid.UUID, start_url: str, max_pages: int = 15) -> None:
    await _set_status(workspace_id, state="crawling", task="crawl", url=start_url,
                      pages_done=0, chunks_done=0, error=None)
    start_url = start_url.rstrip("/")
    domain = urlparse(start_url).netloc

    async with AsyncSessionLocal() as db:
        try:
            # Sync semantics: purge previous chunks of this domain first
            await db.execute(
                sa_delete(KnowledgeDocument).where(
                    KnowledgeDocument.workspace_id == workspace_id,
                    KnowledgeDocument.metadata_["domain"].astext == domain,
                )
            )
            await db.flush()

            queue: list[str] = [start_url]
            visited: set[str] = set()
            content_hashes: set[str] = set()
            pages_done = 0
            total_chunks = 0

            async with httpx.AsyncClient(
                timeout=15, follow_redirects=True,
                headers={"User-Agent": "DeenxAI-KnowledgeBot/1.0"},
            ) as client:
                while queue and pages_done < max_pages:
                    url = queue.pop(0)
                    if url in visited:
                        continue
                    visited.add(url)
                    try:
                        r = await client.get(url)
                        if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
                            continue
                    except Exception:
                        continue

                    html = r.text
                    text = html_to_text(html)
                    if len(text) < 100:
                        continue
                    h = hashlib.sha256(text[:5000].encode()).hexdigest()
                    if h in content_hashes:      # duplicate page content
                        continue
                    content_hashes.add(h)

                    title = extract_title(html) or url
                    chunks = chunk_text(text)
                    total_chunks += await _embed_and_store(
                        db, workspace_id, chunks, title, url, "website",
                        {"domain": domain, "page_url": url},
                    )
                    pages_done += 1
                    await _set_status(workspace_id, pages_done=pages_done, chunks_done=total_chunks)

                    for link in extract_links(html, url):
                        if link not in visited and link not in queue and len(queue) < max_pages * 4:
                            queue.append(link)
                    await asyncio.sleep(0.3)   # polite crawl

            await db.commit()
            await _set_status(workspace_id, state="done", pages_done=pages_done,
                              chunks_done=total_chunks,
                              finished_at=datetime.now(timezone.utc).isoformat())
            logger.info("kb_crawl_done", pages=pages_done, chunks=total_chunks)
        except Exception as e:
            await db.rollback()
            await _set_status(workspace_id, state="error", error=str(e)[:200])
            logger.error("kb_crawl_failed", error=str(e))


# ─── File upload (background task) ───────────────────────────────────────

async def process_upload(workspace_id: uuid.UUID, filename: str, content: bytes) -> None:
    await _set_status(workspace_id, state="processing", task="upload",
                      filename=filename, chunks_done=0, error=None)
    async with AsyncSessionLocal() as db:
        try:
            text = extract_file_text(filename, content)
            if len(text.strip()) < 20:
                raise ValueError("File se koi readable text nahi mila.")
            chunks = chunk_text(text)
            stored = await _embed_and_store(
                db, workspace_id, chunks, filename, f"upload:{filename}", "file",
                {"filename": filename},
            )
            await db.commit()
            await _set_status(workspace_id, state="done", chunks_done=stored,
                              finished_at=datetime.now(timezone.utc).isoformat())
            logger.info("kb_upload_done", file=filename, chunks=stored)
        except Exception as e:
            await db.rollback()
            await _set_status(workspace_id, state="error", error=str(e)[:200])
            logger.error("kb_upload_failed", error=str(e))


# ─── Reindex (background task) ───────────────────────────────────────────

async def reindex_all(workspace_id: uuid.UUID) -> None:
    await _set_status(workspace_id, state="reindexing", task="reindex", chunks_done=0, error=None)
    async with AsyncSessionLocal() as db:
        try:
            res = await db.execute(
                select(KnowledgeDocument).where(KnowledgeDocument.workspace_id == workspace_id)
            )
            docs = list(res.scalars())
            done = 0
            for doc in docs:
                doc.embedding = await _get_embedding(doc.content)
                done += 1
                if done % 10 == 0:
                    await db.flush()
                    await _set_status(workspace_id, chunks_done=done)
            await db.commit()
            await _set_status(workspace_id, state="done", chunks_done=done,
                              finished_at=datetime.now(timezone.utc).isoformat())
        except Exception as e:
            await db.rollback()
            await _set_status(workspace_id, state="error", error=str(e)[:200])


# ─── Stats ───────────────────────────────────────────────────────────────

async def get_stats(db, workspace_id: uuid.UUID) -> dict:
    total = (await db.execute(
        select(func.count(KnowledgeDocument.id))
        .where(KnowledgeDocument.workspace_id == workspace_id)
    )).scalar() or 0

    by_type_res = await db.execute(
        select(KnowledgeDocument.metadata_["type"].astext.label("type"), func.count())
        .where(KnowledgeDocument.workspace_id == workspace_id)
        .group_by(text("1"))
    )
    by_type = {row[0] or "manual": row[1] for row in by_type_res.all()}

    pages = (await db.execute(
        select(func.count(func.distinct(KnowledgeDocument.metadata_["page_url"].astext)))
        .where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.metadata_["type"].astext == "website",
        )
    )).scalar() or 0

    last_sync = (await db.execute(
        select(func.max(KnowledgeDocument.created_at))
        .where(KnowledgeDocument.workspace_id == workspace_id)
    )).scalar()

    return {
        "total_chunks": total,
        "by_type": by_type,
        "website_pages": pages,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }