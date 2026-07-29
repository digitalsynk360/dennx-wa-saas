"""
On-demand branded PDF generation for AI tool calls — Itinerary
(Travel & Tourism) and Quotation (Services/Consulting/Construction/
Interior Design/Event Management/IT/etc.). Same reportlab Platypus
approach used for the pricing plan PDF earlier — proven, clean,
professional output. Returns raw PDF bytes (never touches disk),
so the caller can send it straight to WhatsApp as a document.
"""
import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

TEAL = colors.HexColor("#0F766E")
DARK = colors.HexColor("#111827")
GRAY = colors.HexColor("#6B7280")
LIGHT_BG = colors.HexColor("#F0FDFA")
BORDER = colors.HexColor("#E5E7EB")


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="DocTitle", fontSize=20, leading=24, textColor=DARK, fontName="Helvetica-Bold", spaceAfter=2))
    s.add(ParagraphStyle(name="DocSub", fontSize=11, leading=14, textColor=GRAY, spaceAfter=12))
    s.add(ParagraphStyle(name="DayTitle", fontSize=12.5, leading=15, textColor=colors.white, fontName="Helvetica-Bold"))
    s.add(ParagraphStyle(name="Activity", fontSize=9.5, leading=14, textColor=DARK))
    s.add(ParagraphStyle(name="SmallGray", fontSize=8.5, leading=12, textColor=GRAY))
    s.add(ParagraphStyle(name="CellLeft", fontSize=9, leading=12, textColor=DARK))
    s.add(ParagraphStyle(name="CellRight", fontSize=9, leading=12, textColor=DARK, alignment=2))
    return s


def build_itinerary_pdf(
    business_name: str, destination: str, duration_label: str,
    days: list[dict], budget_note: str | None = None, contact_note: str | None = None,
) -> bytes:
    """days: [{"day_number": 1, "title": "Arrival & City Tour", "activities": ["...", "..."], "notes": "optional"}]"""
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=16 * mm, bottomMargin=16 * mm, leftMargin=16 * mm, rightMargin=16 * mm)
    story = []

    story.append(Paragraph(f"{destination} — Travel Itinerary", styles["DocTitle"]))
    story.append(Paragraph(f"{duration_label} · Prepared by {business_name}", styles["DocSub"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=14))

    for d in days:
        header = Table(
            [[Paragraph(f"Day {d['day_number']} — {d.get('title', '')}", styles["DayTitle"])]],
            colWidths=[178 * mm],
        )
        header.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), TEAL),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(header)

        activities = d.get("activities", [])
        act_rows = [[Paragraph(f"•  {a}", styles["Activity"])] for a in activities]
        if d.get("notes"):
            act_rows.append([Paragraph(f"<i>Note: {d['notes']}</i>", styles["SmallGray"])])
        if act_rows:
            body = Table(act_rows, colWidths=[178 * mm])
            body.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ]))
            story.append(body)
        story.append(Spacer(1, 10))

    if budget_note:
        story.append(Spacer(1, 6))
        story.append(Paragraph("<b>Budget Estimate</b>", styles["CellLeft"]))
        story.append(Paragraph(budget_note, styles["SmallGray"]))

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
    story.append(Spacer(1, 6))
    story.append(Paragraph(contact_note or f"For bookings, reply on this WhatsApp chat — {business_name}", styles["SmallGray"]))

    doc.build(story)
    return buf.getvalue()


def build_quotation_pdf(
    business_name: str, client_name: str, subject: str,
    items: list[dict], notes: str | None = None, valid_until: str | None = None,
) -> bytes:
    """items: [{"description": "...", "qty": 1, "unit_price": 5000, "amount": 5000}] — prices in rupees (whole units, not paise, since AI generates these as human-readable estimates)."""
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=16 * mm, bottomMargin=16 * mm, leftMargin=16 * mm, rightMargin=16 * mm)
    story = []

    story.append(Paragraph(f"Quotation — {subject}", styles["DocTitle"]))
    story.append(Paragraph(f"Prepared for {client_name} by {business_name}" + (f" · Valid until {valid_until}" if valid_until else ""), styles["DocSub"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=14))

    rows = [[
        Paragraph("<b>Description</b>", styles["CellLeft"]),
        Paragraph("<b>Qty</b>", styles["CellRight"]),
        Paragraph("<b>Unit Price</b>", styles["CellRight"]),
        Paragraph("<b>Amount</b>", styles["CellRight"]),
    ]]
    total = 0
    for it in items:
        amount = it.get("amount", it.get("qty", 1) * it.get("unit_price", 0))
        total += amount
        rows.append([
            Paragraph(it.get("description", ""), styles["CellLeft"]),
            Paragraph(str(it.get("qty", 1)), styles["CellRight"]),
            Paragraph(f"₹{it.get('unit_price', 0):,.0f}", styles["CellRight"]),
            Paragraph(f"₹{amount:,.0f}", styles["CellRight"]),
        ])
    rows.append(["", "", Paragraph("<b>Total</b>", styles["CellRight"]), Paragraph(f"<b>₹{total:,.0f}</b>", styles["CellRight"])])

    table = Table(rows, colWidths=[85 * mm, 20 * mm, 35 * mm, 38 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -2), 0.4, BORDER),
        ("LINEABOVE", (0, -1), (-1, -1), 1, DARK),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    if notes:
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Notes</b>", styles["CellLeft"]))
        story.append(Paragraph(notes, styles["SmallGray"]))

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"Reply on this WhatsApp chat to confirm or ask questions — {business_name}", styles["SmallGray"]))

    doc.build(story)
    return buf.getvalue()