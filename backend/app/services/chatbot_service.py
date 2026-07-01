"""
Chatbot service.
NOTE: ChatbotRule has NO case_sensitive field — removed those references.
"""
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.automation import ChatbotFlow, ChatbotRule
from app.core.logging import get_logger

logger = get_logger(__name__)


async def match_message(
    db: AsyncSession, workspace_id: uuid.UUID, message_text: str
) -> ChatbotRule | None:
    """Find highest priority active rule matching the message."""
    stmt = (
        select(ChatbotRule)
        .where(ChatbotRule.workspace_id == workspace_id)
        .where(ChatbotRule.is_active == True)
        .order_by(ChatbotRule.priority.desc())
    )
    result = await db.execute(stmt)
    rules = result.scalars().all()
    text = message_text.strip()

    for rule in rules:
        # ✅ No case_sensitive field on ChatbotRule — always case-insensitive
        if _text_matches(text, rule.keywords or [], rule.match_type or "contains"):
            logger.info("chatbot_rule_matched",
                rule_id=str(rule.id), keywords=rule.keywords, msg=text[:40])
            return rule
    return None


async def match_flow_trigger(
    db: AsyncSession, workspace_id: uuid.UUID, message_text: str
) -> ChatbotFlow | None:
    """
    Scan active flows for a keyword_trigger node that matches the message.
    Checks both 'keywords' (list) and 'keywords_raw' (comma string) fields.
    """
    stmt = (
        select(ChatbotFlow)
        .where(ChatbotFlow.workspace_id == workspace_id)
        .where(ChatbotFlow.is_active == True)
    )
    result = await db.execute(stmt)
    flows = result.scalars().all()
    text = message_text.strip()

    logger.info("flow_trigger_check",
        active_flows=len(flows), message=text[:40])

    for flow in flows:
        nodes = flow.nodes or []
        logger.debug("checking_flow_nodes",
            flow_id=str(flow.id), flow_name=flow.name, node_count=len(nodes))

        for node in nodes:
            node_type = node.get("type", "")
            data = node.get("data", {})

            if node_type == "keyword_trigger":
                # Support list format
                keywords = data.get("keywords", [])
                # Support comma-string format (from Flow Builder)
                keywords_raw = data.get("keywords_raw", "")

                if isinstance(keywords_raw, str) and keywords_raw.strip():
                    keywords = [k.strip() for k in keywords_raw.split(",") if k.strip()]
                elif isinstance(keywords, list) and keywords:
                    pass  # already a list
                elif isinstance(keywords_raw, str) and keywords_raw:
                    keywords = [keywords_raw.strip()]

                logger.debug("keyword_trigger_node",
                    flow_id=str(flow.id), keywords=keywords,
                    keywords_raw=keywords_raw, message=text[:40])

                if not keywords:
                    continue

                match_type = data.get("match_type", "contains")
                if _text_matches(text, keywords, match_type):
                    logger.info("flow_keyword_matched",
                        flow_id=str(flow.id), flow_name=flow.name,
                        keywords=keywords, msg=text[:50])
                    return flow

            elif node_type == "new_message_trigger":
                first_only = data.get("first_message_only", False)
                if not first_only:
                    logger.info("flow_new_message_trigger_matched",
                        flow_id=str(flow.id), flow_name=flow.name)
                    return flow

    logger.info("no_flow_trigger_matched", message=text[:40])
    return None


def _text_matches(text: str, keywords: list[str], match_type: str) -> bool:
    """Case-insensitive matching."""
    compare = text.lower()
    for kw in keywords:
        kw_c = kw.lower()
        if match_type == "exact"       and compare == kw_c:          return True
        if match_type == "contains"    and kw_c in compare:          return True
        if match_type == "starts_with" and compare.startswith(kw_c): return True
        if match_type == "ends_with"   and compare.endswith(kw_c):   return True
    return False


async def list_rules(db: AsyncSession, workspace_id: uuid.UUID) -> list[ChatbotRule]:
    stmt = (
        select(ChatbotRule)
        .where(ChatbotRule.workspace_id == workspace_id)
        .order_by(ChatbotRule.priority.desc(), ChatbotRule.created_at)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_rule(
    db: AsyncSession, workspace_id: uuid.UUID,
    keywords: list[str], match_type: str,
    reply_text: str | None, flow_id: uuid.UUID | None,
    name: str = "Rule",
) -> ChatbotRule:
    stmt = select(ChatbotRule).where(ChatbotRule.workspace_id == workspace_id)
    result = await db.execute(stmt)
    existing = result.scalars().all()
    next_priority = max((r.priority for r in existing), default=0) + 1
    rule = ChatbotRule(
        workspace_id=workspace_id,
        name=name,
        keywords=keywords,
        match_type=match_type,
        reply_text=reply_text,
        flow_id=flow_id,
        priority=next_priority,
        is_active=True,
    )
    db.add(rule)
    await db.flush()
    return rule


async def update_rule(db: AsyncSession, rule: ChatbotRule, **kwargs) -> ChatbotRule:
    for k, v in kwargs.items():
        if hasattr(rule, k):
            setattr(rule, k, v)
    await db.flush()
    return rule


async def delete_rule(db: AsyncSession, rule: ChatbotRule) -> None:
    await db.delete(rule)
    await db.flush()


async def reorder_rules(
    db: AsyncSession, workspace_id: uuid.UUID, rule_ids: list[uuid.UUID]
) -> None:
    for i, rule_id in enumerate(rule_ids):
        stmt = select(ChatbotRule).where(
            ChatbotRule.id == rule_id,
            ChatbotRule.workspace_id == workspace_id,
        )
        result = await db.execute(stmt)
        rule = result.scalar_one_or_none()
        if rule:
            rule.priority = i + 1
    await db.flush()