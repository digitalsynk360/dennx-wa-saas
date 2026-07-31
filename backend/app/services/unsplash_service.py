"""
Unsplash photo search — used by the AI itinerary tool to embed a real,
properly-licensed destination photo instead of nothing, when the
workspace has an Unsplash Access Key configured.

Follows Unsplash's API Guidelines (verified against their current
documentation):
  1. Photo attribution (photographer + Unsplash, with a profile link
     using UTM params) is required wherever the photo is displayed —
     see pdf_documents_premium.py, which prints this under each photo.
  2. A download-tracking GET request must fire every time a photo is
     actually used (not just searched) — track_download() below.
  3. Access Key/Secret Key stay server-side only, never sent to the
     frontend or embedded client-side.

Graceful by design: any failure (no key configured, network error,
no results, rate limited) returns None rather than raising — the
itinerary tool already treats "no photo for this day" as a normal,
supported case (Option 3 fallback), so a missing photo never blocks
the itinerary from being generated and sent.
"""
import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

UNSPLASH_API_BASE = "https://api.unsplash.com"


async def search_destination_photo(query: str) -> dict | None:
    """Returns {photo_bytes, photographer_name, photographer_url,
    attribution_text} for the best-matching photo, or None if
    Unsplash isn't configured / nothing matched / the call failed."""
    if not settings.UNSPLASH_ACCESS_KEY:
        return None

    headers = {"Authorization": f"Client-ID {settings.UNSPLASH_ACCESS_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            search_resp = await client.get(
                f"{UNSPLASH_API_BASE}/search/photos",
                params={"query": query, "per_page": 1, "orientation": "landscape"},
                headers=headers,
            )
        if search_resp.status_code != 200:
            logger.warning("unsplash_search_failed", status=search_resp.status_code, query=query)
            return None

        results = search_resp.json().get("results", [])
        if not results:
            return None
        photo = results[0]

        # Fetch the actual image bytes to embed in the PDF. A PDF is a
        # static file, not a live web page, so it can't "hotlink" the
        # way a website would -- the bytes have to be baked in at
        # generation time. This is a one-off fetch per document, not
        # an ongoing re-host/cache of Unsplash's library.
        image_url = photo["urls"]["regular"]
        async with httpx.AsyncClient(timeout=15) as client:
            img_resp = await client.get(image_url)
        if img_resp.status_code != 200:
            logger.warning("unsplash_image_fetch_failed", status=img_resp.status_code)
            return None

        photographer_name = photo["user"]["name"]
        photographer_url = f"{photo['user']['links']['html']}?utm_source={settings.UNSPLASH_APP_NAME}&utm_medium=referral"
        unsplash_url = f"https://unsplash.com/?utm_source={settings.UNSPLASH_APP_NAME}&utm_medium=referral"

        # Required: notify Unsplash this photo was actually used (not
        # just returned in a search) -- fire-and-forget, doesn't block
        # the itinerary if it fails.
        await _track_download(photo.get("links", {}).get("download_location"))

        return {
            "photo_bytes": img_resp.content,
            "photographer_name": photographer_name,
            "photographer_url": photographer_url,
            "unsplash_url": unsplash_url,
            "attribution_text": f"Photo by {photographer_name} on Unsplash",
        }
    except Exception as e:
        logger.warning("unsplash_search_error", query=query, error=str(e))
        return None


async def _track_download(download_location: str | None) -> None:
    if not download_location or not settings.UNSPLASH_ACCESS_KEY:
        return
    try:
        headers = {"Authorization": f"Client-ID {settings.UNSPLASH_ACCESS_KEY}"}
        async with httpx.AsyncClient(timeout=8) as client:
            await client.get(download_location, headers=headers)
    except Exception as e:
        logger.warning("unsplash_track_download_failed", error=str(e))