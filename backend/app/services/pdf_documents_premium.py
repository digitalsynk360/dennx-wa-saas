"""
Premium boutique-travel-brochure itinerary PDF template.

Design language (fixed structure, color palette varies by destination —
see PALETTES below):
  - Script-font destination title over a bold "IN X DAYS" line
  - Thin divider under the tagline
  - Circular accent-colored "Day N" badge per section
  - Small custom vector bullet icons (not plain dots)
  - Optional real photo beside each day's text, rounded corners
  - Accent-tinted "Why This Itinerary Works" summary box with check marks
  - Day-section count is fully dynamic — pass as many/few as the trip needs

Honest note on scope: this is built with reportlab (vector/programmatic
PDF generation), not Canva/Figma/InDesign — those are GUI design tools
I can't operate. What IS reproduced faithfully: the color system,
typography pairing (script + bold sans), circular day badges, custom
icon bullets, photo framing, and the boxed summary callout. What is
NOT reproduced (needs real illustrated artwork, not vector-drawable):
watercolor painterly header art and hand-illustrated botanical corner
sprigs — a solid header block with a subtle wave accent is used
instead so the layout stays premium without faking hand-illustration.

Photos: this module accepts photo BYTES the caller provides — it does
not fetch images from the web itself. Auto-pulling web photos into a
customer-facing document raises real copyright/licensing risk for the
business sending it; sourcing photos (business-uploaded, or a properly
licensed stock API like Unsplash's) is intentionally kept as the
caller's responsibility, not baked in here.
"""
import io
import os
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.pdfgen.canvas import Canvas

# ── Curated, pre-tested destination palettes ──
# Each has: primary (header bg), primary_dark (header depth accent),
# accent (badges/icons/dividers), accent_light (summary box tint).
PALETTES: dict[str, dict] = {
    "mountain_teal": {
        "label": "Mountains / Hill Stations",
        "primary": "#0E4F4F", "primary_dark": "#0A3B3B",
        "accent": "#E8604C", "accent_light": "#FBE8E4",
    },
    "coastal_blue": {
        "label": "Beaches / Coastal",
        "primary": "#0B3D66", "primary_dark": "#082C4A",
        "accent": "#F2994A", "accent_light": "#FDEEDD",
    },
    "desert_warm": {
        "label": "Desert / Rajasthan",
        "primary": "#7A3B2E", "primary_dark": "#5C2B21",
        "accent": "#E0A639", "accent_light": "#FBF1DA",
    },
    "heritage_royal": {
        "label": "Palaces / Heritage Cities",
        "primary": "#3E2352", "primary_dark": "#2C1839",
        "accent": "#D4AB4E", "accent_light": "#F3E9D8",
    },
    "tropical_green": {
        "label": "Backwaters / Forests / Wildlife",
        "primary": "#1F4D3A", "primary_dark": "#153629",
        "accent": "#E8944A", "accent_light": "#FBEEDD",
    },
    "monsoon_slate": {
        "label": "General / City Breaks",
        "primary": "#33475B", "primary_dark": "#243444",
        "accent": "#E0A03E", "accent_light": "#FBF0D9",
    },
}
DEFAULT_PALETTE = "monsoon_slate"

_KEYWORD_PALETTE_MAP = [
    (r"goa|kerala|andaman|beach|coastal|backwater|sea|island|lakshadweep", "coastal_blue"),
    (r"rajasthan|jaisalmer|jodhpur|desert|thar|bikaner|barmer", "desert_warm"),
    (r"jaipur|udaipur|palace|heritage|fort|mysore|hyderabad", "heritage_royal"),
    (r"munnar|wayanad|coorg|jungle|wildlife|forest|western ghats|sundarbans|jim corbett|ranthambore", "tropical_green"),
    (r"kashmir|manali|shimla|himachal|ladakh|sikkim|darjeeling|mountain|hill station|uttarakhand|nainital", "mountain_teal"),
]


def suggest_palette(destination: str) -> str:
    """Keyword-based fallback when no palette is explicitly chosen —
    the AI tool call can (and should) pick one directly using its own
    knowledge of the destination; this is just a sensible default."""
    d = destination.lower()
    for pattern, key in _KEYWORD_PALETTE_MAP:
        if re.search(pattern, d):
            return key
    return DEFAULT_PALETTE


PAGE_W, PAGE_H = A4

MARGIN = 16 * mm

INK = colors.HexColor("#22302E")
GRAY = colors.HexColor("#6B7A78")


def _resolve_palette(palette_key: str | None, destination: str) -> dict:
    key = palette_key if palette_key in PALETTES else suggest_palette(destination)
    p = PALETTES[key]
    return {
        "primary": colors.HexColor(p["primary"]),
        "primary_dark": colors.HexColor(p["primary_dark"]),
        "accent": colors.HexColor(p["accent"]),
        "accent_light": colors.HexColor(p["accent_light"]),
        "key": key,
    }


# ── Fonts — real Google Fonts (Great Vibes script + Poppins sans), embedded ──
FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")
_FONTS_REGISTERED = False


def _register_fonts():
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    pdfmetrics.registerFont(TTFont("Script", os.path.join(FONT_DIR, "GreatVibes-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Sans-Bold", os.path.join(FONT_DIR, "Poppins-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("Sans-SemiBold", os.path.join(FONT_DIR, "Poppins-SemiBold.ttf")))
    pdfmetrics.registerFont(TTFont("Sans-Medium", os.path.join(FONT_DIR, "Poppins-Medium.ttf")))
    pdfmetrics.registerFont(TTFont("Sans", os.path.join(FONT_DIR, "Poppins-Regular.ttf")))
    _FONTS_REGISTERED = True


# ── Small vector bullet icons (drawn, not unicode dingbats — crisp at any size) ──

def _icon_pin(c: Canvas, x, y, size, color):
    """A small map-pin glyph for place/activity bullets."""
    c.saveState()
    c.setFillColor(color)
    r = size * 0.42
    cx, cy = x + size / 2, y + size * 0.62
    c.circle(cx, cy, r, stroke=0, fill=1)
    p = c.beginPath()
    p.moveTo(cx - r * 0.75, cy - r * 0.35)
    p.lineTo(cx, y)
    p.lineTo(cx + r * 0.75, cy - r * 0.35)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.circle(cx, cy, r * 0.42, stroke=0, fill=1)
    c.restoreState()


def _icon_check(c: Canvas, x, y, size, color):
    """Check mark for the summary box."""
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(size * 0.16)
    c.setLineCap(1)
    c.setLineJoin(1)
    p = c.beginPath()
    p.moveTo(x + size * 0.08, y + size * 0.5)
    p.lineTo(x + size * 0.38, y + size * 0.2)
    p.lineTo(x + size * 0.92, y + size * 0.78)
    c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def _rounded_image(c: Canvas, img_bytes: bytes, x, y, w, h, radius):
    """Draws an image clipped to a rounded-rectangle frame."""
    c.saveState()
    p = c.beginPath()
    p.roundRect(x, y, w, h, radius)
    c.clipPath(p, stroke=0, fill=0)
    img = ImageReader(io.BytesIO(img_bytes))
    iw, ih = img.getSize()
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    ox, oy = x - (dw - w) / 2, y - (dh - h) / 2
    c.drawImage(img, ox, oy, dw, dh, mask="auto")
    c.restoreState()
    c.saveState()
    c.setStrokeColor(colors.white)
    c.setLineWidth(2.2)
    p2 = c.beginPath()
    p2.roundRect(x, y, w, h, radius)
    c.drawPath(p2, stroke=1, fill=0)
    c.restoreState()


def _header(c: Canvas, pal: dict, business_name: str, destination: str, duration_label: str, tagline: str | None):
    header_h = 78 * mm
    c.setFillColor(pal["primary"])
    c.rect(0, PAGE_H - header_h, PAGE_W, header_h, stroke=0, fill=1)
    # subtle darker accent wave band for depth (stand-in for illustrated art)
    c.setFillColor(pal["primary_dark"])
    p = c.beginPath()
    p.moveTo(0, PAGE_H - header_h)
    p.curveTo(PAGE_W * 0.3, PAGE_H - header_h + 10 * mm, PAGE_W * 0.7, PAGE_H - header_h - 6 * mm, PAGE_W, PAGE_H - header_h + 4 * mm)
    p.lineTo(PAGE_W, PAGE_H - header_h)
    p.close()
    c.drawPath(p, stroke=0, fill=1)

    c.setFillColor(colors.Color(1, 1, 1, alpha=0.85))
    c.setFont("Sans-Medium", 9)
    c.drawString(MARGIN, PAGE_H - 12 * mm, business_name.upper())

    c.setFillColor(colors.white)
    c.setFont("Script", 46)
    c.drawString(MARGIN, PAGE_H - 34 * mm, destination)

    c.setFont("Sans-Bold", 15)
    c.setFillColor(pal["accent"])
    c.drawString(MARGIN, PAGE_H - 43 * mm, f"IN {duration_label.upper()}")

    # thin decorative divider under tagline
    if tagline:
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.9))
        c.setFont("Sans", 10.5)
        c.drawString(MARGIN, PAGE_H - 51 * mm, tagline)
    c.setStrokeColor(pal["accent"])
    c.setLineWidth(1.2)
    c.line(MARGIN, PAGE_H - 55 * mm, MARGIN + 46 * mm, PAGE_H - 55 * mm)


def _day_badge(c: Canvas, pal: dict, x, y, day_number: int):
    r = 6.5 * mm
    c.setFillColor(pal["accent"])
    c.circle(x + r, y - r, r, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Sans-Bold", 12)
    c.drawCentredString(x + r, y - r - 3.6, str(day_number))


def _wrapped_lines(c: Canvas, text: str, font: str, size: float, max_width: float) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if pdfmetrics.stringWidth(trial, font, size) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def build_itinerary_pdf_premium(
    business_name: str,
    destination: str,
    duration_label: str,
    days: list[dict],
    tagline: str | None = None,
    budget_note: str | None = None,
    why_it_works: list[str] | None = None,
    day_photos: dict[int, dict | bytes] | None = None,
    palette: str | None = None,
) -> bytes:
    """
    days: [{"day_number": 1, "title": "Arrival & Old City", "activities": ["...", "..."], "notes": "optional"}]
    day_photos: optional {day_number: bytes} for a plain photo, or
                {day_number: {"photo_bytes": bytes, "attribution_text": str,
                "photographer_url": str}} when attribution needs to be
                shown (e.g. Unsplash-sourced photos) -- a real photo shown
                beside that day's text block, framed with rounded corners.
                Days without a photo simply use the full text width.
    why_it_works: optional list of short strings for the bottom summary box.
    palette: optional key from PALETTES (e.g. "coastal_blue") -- when the
             caller (typically the AI, which knows the destination's
             character) doesn't pass one, a keyword-based guess is used
             (see suggest_palette()) so the color scheme still fits the
             destination rather than defaulting to one fixed look.
    """
    _register_fonts()
    pal = _resolve_palette(palette, destination)
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)

    def new_page_body_top():
        return PAGE_H - 78 * mm - 14 * mm

    _header(c, pal, business_name, destination, duration_label, tagline)
    y = new_page_body_top()
    content_w = PAGE_W - 2 * MARGIN

    for d in days:
        block_h_estimate = 8 + len(d.get("activities", [])) * 6 + (10 if d.get("notes") else 0)
        if y - block_h_estimate * mm < 30 * mm:
            c.showPage()
            _header(c, pal, business_name, destination, duration_label, None)
            y = new_page_body_top()

        badge_x = MARGIN
        _day_badge(c, pal, badge_x, y, d["day_number"])
        c.setFillColor(INK)
        c.setFont("Sans-SemiBold", 13.5)
        c.drawString(badge_x + 16 * mm, y - 4.5 * mm, d.get("title", ""))
        y -= 11 * mm

        photo_entry = (day_photos or {}).get(d["day_number"])
        text_w = content_w
        photo_w = 40 * mm
        if photo_entry:
            photo_bytes = photo_entry["photo_bytes"] if isinstance(photo_entry, dict) else photo_entry
            text_w = content_w - photo_w - 6 * mm
            photo_h = min(34 * mm, 7 * mm * max(len(d.get("activities", [])), 3))
            photo_x = MARGIN + text_w + 6 * mm
            photo_y = y - photo_h + 4 * mm
            _rounded_image(c, photo_bytes, photo_x, photo_y, photo_w, photo_h, 4 * mm)

            if isinstance(photo_entry, dict) and photo_entry.get("attribution_text"):
                # Unsplash API guideline: every displayed photo needs
                # attribution + a clickable link back to the
                # photographer/Unsplash. Tiny caption directly under
                # the photo, real clickable link annotation in the PDF.
                c.setFillColor(GRAY)
                c.setFont("Sans", 5.6)
                cap = photo_entry["attribution_text"]
                c.drawCentredString(photo_x + photo_w / 2, photo_y - 3 * mm, cap)
                if photo_entry.get("photographer_url"):
                    cap_w = pdfmetrics.stringWidth(cap, "Sans", 5.6)
                    c.linkURL(
                        photo_entry["photographer_url"],
                        (photo_x + photo_w / 2 - cap_w / 2, photo_y - 4.2 * mm, photo_x + photo_w / 2 + cap_w / 2, photo_y - 2 * mm),
                        relative=0,
                    )

        text_x = MARGIN + 16 * mm
        text_w_eff = text_w - 16 * mm
        for act in d.get("activities", []):
            lines = _wrapped_lines(c, act, "Sans", 9.6, text_w_eff - 7 * mm)
            _icon_pin(c, text_x, y - 3.6 * mm, 3.6 * mm, pal["accent"])
            c.setFillColor(INK)
            c.setFont("Sans", 9.6)
            for i, line in enumerate(lines):
                c.drawString(text_x + 6 * mm, y - 3.2 * mm - i * 4.6 * mm, line)
            y -= 4.6 * mm * len(lines) + 1.6 * mm

        if d.get("notes"):
            c.setFillColor(GRAY)
            c.setFont("Sans", 8.3)
            for line in _wrapped_lines(c, f"Note: {d['notes']}", "Sans", 8.3, text_w_eff):
                c.drawString(text_x, y - 3 * mm, line)
                y -= 4 * mm

        y -= 7 * mm
        c.setStrokeColor(colors.HexColor("#E7E2D8"))
        c.setLineWidth(0.6)
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        y -= 8 * mm

    if budget_note:
        if y < 45 * mm:
            c.showPage()
            _header(c, pal, business_name, destination, duration_label, None)
            y = new_page_body_top()
        c.setFillColor(pal["primary"])
        c.setFont("Sans-SemiBold", 10.5)
        c.drawString(MARGIN, y, "BUDGET ESTIMATE")
        y -= 5.5 * mm
        c.setFillColor(INK)
        c.setFont("Sans", 9.3)
        for line in _wrapped_lines(c, budget_note, "Sans", 9.3, content_w):
            c.drawString(MARGIN, y, line)
            y -= 4.6 * mm
        y -= 4 * mm

    if why_it_works:
        box_h = 14 * mm + len(why_it_works) * 6.4 * mm
        if y - box_h < 20 * mm:
            c.showPage()
            _header(c, pal, business_name, destination, duration_label, None)
            y = new_page_body_top()
        c.setFillColor(pal["accent_light"])
        p = c.beginPath()
        p.roundRect(MARGIN, y - box_h, content_w, box_h, 4 * mm)
        c.drawPath(p, stroke=0, fill=1)
        c.setFillColor(pal["accent"])
        c.setFont("Sans-Bold", 11.5)
        c.drawString(MARGIN + 6 * mm, y - 9 * mm, "Why This Itinerary Works")
        yy = y - 16 * mm
        for point in why_it_works:
            _icon_check(c, MARGIN + 6 * mm, yy - 3.6 * mm, 4 * mm, pal["primary"])
            c.setFillColor(INK)
            c.setFont("Sans", 9.3)
            for i, line in enumerate(_wrapped_lines(c, point, "Sans", 9.3, content_w - 18 * mm)):
                c.drawString(MARGIN + 13 * mm, yy - 3 * mm - i * 4.4 * mm, line)
            yy -= 6.4 * mm
        y -= box_h + 6 * mm

    c.setFillColor(GRAY)
    c.setFont("Sans", 7.6)
    c.drawCentredString(PAGE_W / 2, 10 * mm, f"Reply on this WhatsApp chat to confirm or ask questions -- {business_name}")

    c.save()
    return buf.getvalue()