"""
Analytics service — Phase 12. Aggregation queries over Phase 1-10
tables for the Analytics dashboard. All queries are scoped by
workspace_id (multi-tenant) and a configurable lookback window.

Note: chatbot rule "trigger count" is approximated from audit_logs
in this phase (no dedicated rule_triggers table yet) — if no audit
events exist it degrades gracefully to an empty list rather than
erroring, since audit logging of bot triggers is wired in a later
hardening pass.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign, CampaignRecipient
from app.models.contact import Contact
from app.models.messaging import Conversation, Message


async def get_overview(db: AsyncSession, workspace_id: uuid.UUID, period_days: int = 30) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=period_days)

    # Conversation counts
    conv_counts = (await db.execute(
        select(
            func.count(),
            func.sum(case((Conversation.status == "open", 1), else_=0)),
            func.sum(case((Conversation.status == "resolved", 1), else_=0)),
        ).where(Conversation.workspace_id == workspace_id)
    )).one()
    total_conversations = conv_counts[0] or 0
    open_conversations = conv_counts[1] or 0
    resolved_conversations = conv_counts[2] or 0

    # Contact counts
    contact_counts = (await db.execute(
        select(
            func.count(),
            func.sum(case((Contact.created_at >= since, 1), else_=0)),
        ).where(Contact.workspace_id == workspace_id)
    )).one()
    total_contacts = contact_counts[0] or 0
    new_contacts = contact_counts[1] or 0

    # Message counts (in period)
    msg_counts = (await db.execute(
        select(
            func.sum(case((Message.direction == "outbound", 1), else_=0)),
            func.sum(case((Message.direction == "inbound", 1), else_=0)),
        )
        .where(Message.workspace_id == workspace_id)
        .where(Message.created_at >= since)
    )).one()
    messages_sent = msg_counts[0] or 0
    messages_received = msg_counts[1] or 0

    # Average first-response time: time between first inbound and
    # first outbound message per conversation (period-scoped)
    avg_response = await _avg_response_time_minutes(db, workspace_id, since)

    active_campaigns = (await db.execute(
        select(func.count()).where(Campaign.workspace_id == workspace_id).where(Campaign.status == "running")
    )).scalar_one()

    daily_messages = await _daily_message_counts(db, workspace_id, period_days)
    campaign_performance = await _campaign_performance(db, workspace_id, since)

    return {
        "metrics": {
            "total_conversations": total_conversations,
            "open_conversations": open_conversations,
            "resolved_conversations": resolved_conversations,
            "total_contacts": total_contacts,
            "new_contacts_this_period": new_contacts,
            "messages_sent": messages_sent,
            "messages_received": messages_received,
            "avg_response_time_minutes": avg_response,
            "active_campaigns": active_campaigns,
        },
        "daily_messages": daily_messages,
        "campaign_performance": campaign_performance,
        "top_chatbot_rules": [],  # see module docstring
        "period_days": period_days,
    }


async def _avg_response_time_minutes(
    db: AsyncSession, workspace_id: uuid.UUID, since: datetime
) -> float | None:
    result = await db.execute(
        select(Message.conversation_id, Message.direction, Message.created_at)
        .where(Message.workspace_id == workspace_id)
        .where(Message.created_at >= since)
        .order_by(Message.conversation_id, Message.created_at)
    )
    rows = result.all()

    first_inbound: dict[uuid.UUID, datetime] = {}
    deltas: list[float] = []

    for conv_id, direction, created_at in rows:
        if direction == "inbound" and conv_id not in first_inbound:
            first_inbound[conv_id] = created_at
        elif direction == "outbound" and conv_id in first_inbound:
            delta = (created_at - first_inbound[conv_id]).total_seconds() / 60
            deltas.append(delta)
            del first_inbound[conv_id]  # only count first response per conversation

    if not deltas:
        return None
    return round(sum(deltas) / len(deltas), 1)


async def _daily_message_counts(db: AsyncSession, workspace_id: uuid.UUID, period_days: int) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=period_days)
    result = await db.execute(
        select(
            func.date(Message.created_at).label("day"),
            func.sum(case((Message.direction == "outbound", 1), else_=0)).label("sent"),
            func.sum(case((Message.direction == "inbound", 1), else_=0)).label("received"),
        )
        .where(Message.workspace_id == workspace_id)
        .where(Message.created_at >= since)
        .group_by(func.date(Message.created_at))
        .order_by(func.date(Message.created_at))
    )
    return [{"date": row.day, "sent": row.sent or 0, "received": row.received or 0} for row in result.all()]


async def _campaign_performance(db: AsyncSession, workspace_id: uuid.UUID, since: datetime) -> list[dict]:
    result = await db.execute(
        select(
            Campaign.id,
            Campaign.name,
            Campaign.sent_count,
            Campaign.delivered_count,
            Campaign.read_count,
            Campaign.failed_count,
        )
        .where(Campaign.workspace_id == workspace_id)
        .where(Campaign.created_at >= since)
        .order_by(Campaign.created_at.desc())
        .limit(10)
    )
    rows = result.all()
    performance = []
    for row in rows:
        sent = row.sent_count or 0
        delivered = row.delivered_count or 0
        read = row.read_count or 0
        performance.append({
            "campaign_id": str(row.id),
            "name": row.name,
            "sent": sent,
            "delivered": delivered,
            "read": read,
            "failed": row.failed_count or 0,
            "delivery_rate": round(delivered / sent * 100, 1) if sent else 0.0,
            "read_rate": round(read / sent * 100, 1) if sent else 0.0,
        })
    return performance
async def get_dashboard_overview(db: AsyncSession, workspace_id: uuid.UUID, meta_days: int = 7) -> dict:
    """Real metrics for Dashboard page."""
    from datetime import timedelta
    from app.models.automation import ChatbotFlow, FlowSession
    from app.models.campaign import Campaign

    now   = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago   = now - timedelta(days=7)
    month_ago  = now - timedelta(days=30)
    prev_month = now - timedelta(days=60)

    async def count(stmt):
        r = await db.execute(stmt)
        return r.scalar() or 0

    # Conversations
    open_convs = await count(
        select(func.count(Conversation.id))
        .where(Conversation.workspace_id == workspace_id)
        .where(Conversation.status == "open")
    )
    bot_handling = await count(
        select(func.count(Conversation.id))
        .where(Conversation.workspace_id == workspace_id)
        .where(Conversation.status == "open")
        .where(Conversation.handling == "bot")
    )
    resolved_today = await count(
        select(func.count(Conversation.id))
        .where(Conversation.workspace_id == workspace_id)
        .where(Conversation.status == "resolved")
        .where(Conversation.resolved_at >= today)
    )

    # Messages
    msgs_today = await count(
        select(func.count(Message.id))
        .where(Message.workspace_id == workspace_id)
        .where(Message.created_at >= today)
    )
    msgs_in_today = await count(
        select(func.count(Message.id))
        .where(Message.workspace_id == workspace_id)
        .where(Message.direction == "inbound")
        .where(Message.created_at >= today)
    )
    msgs_out_today = await count(
        select(func.count(Message.id))
        .where(Message.workspace_id == workspace_id)
        .where(Message.direction == "outbound")
        .where(Message.created_at >= today)
    )
    msgs_month = await count(
        select(func.count(Message.id))
        .where(Message.workspace_id == workspace_id)
        .where(Message.created_at >= month_ago)
    )
    msgs_prev = await count(
        select(func.count(Message.id))
        .where(Message.workspace_id == workspace_id)
        .where(Message.created_at >= prev_month)
        .where(Message.created_at < month_ago)
    )

    # Contacts
    total_contacts = await count(
        select(func.count(Contact.id))
        .where(Contact.workspace_id == workspace_id)
    )
    new_contacts_week = await count(
        select(func.count(Contact.id))
        .where(Contact.workspace_id == workspace_id)
        .where(Contact.created_at >= week_ago)
    )
    new_contacts_prev = await count(
        select(func.count(Contact.id))
        .where(Contact.workspace_id == workspace_id)
        .where(Contact.created_at >= now - timedelta(days=14))
        .where(Contact.created_at < week_ago)
    )

    # Campaigns
    active_campaigns = await count(
        select(func.count(Campaign.id))
        .where(Campaign.workspace_id == workspace_id)
        .where(Campaign.status.in_(["running", "scheduled"]))
    )
    total_campaigns = await count(
        select(func.count(Campaign.id))
        .where(Campaign.workspace_id == workspace_id)
        .where(Campaign.status == "completed")
    )

    # Flows
    active_flows = await count(
        select(func.count(ChatbotFlow.id))
        .where(ChatbotFlow.workspace_id == workspace_id)
        .where(ChatbotFlow.is_active == True)
    )
    active_sessions = await count(
        select(func.count(FlowSession.id))
        .where(FlowSession.workspace_id == workspace_id)
        .where(FlowSession.status == "waiting")
    )

    # Growth %
    def growth(cur, prev):
        if not prev:
            return None
        return round(((cur - prev) / prev) * 100, 1)

    # Daily chart last 7 days
    daily_chart = []
    for i in range(6, -1, -1):
        day_start = today - timedelta(days=i)
        day_end   = day_start + timedelta(days=1)
        d_in  = await count(
            select(func.count(Message.id))
            .where(Message.workspace_id == workspace_id)
            .where(Message.direction == "inbound")
            .where(Message.created_at >= day_start)
            .where(Message.created_at < day_end)
        )
        d_out = await count(
            select(func.count(Message.id))
            .where(Message.workspace_id == workspace_id)
            .where(Message.direction == "outbound")
            .where(Message.created_at >= day_start)
            .where(Message.created_at < day_end)
        )
        daily_chart.append({
            "date": day_start.strftime("%d %b"),
            "inbound": d_in,
            "outbound": d_out,
        })

    # Avg response time (reuse existing function)
    avg_response = await _avg_response_time_minutes(db, workspace_id, week_ago)

    meta_insights = await _get_meta_insights(db, workspace_id, meta_days)

    return {
        "conversations": {
            "open": open_convs,
            "bot_handling": bot_handling,
            "resolved_today": resolved_today,
        },
        "messages": {
            "today": msgs_today,
            "inbound_today": msgs_in_today,
            "outbound_today": msgs_out_today,
            "this_month": msgs_month,
            "growth_pct": growth(msgs_month, msgs_prev),
        },
        "contacts": {
            "total": total_contacts,
            "new_this_week": new_contacts_week,
            "growth_pct": growth(new_contacts_week, new_contacts_prev),
        },
        "campaigns": {
            "active": active_campaigns,
            "total_sent": total_campaigns,
        },
        "flows": {
            "active": active_flows,
            "active_sessions": active_sessions,
        },
        "avg_response_minutes": avg_response,
        "daily_chart": daily_chart,
        "meta_insights": meta_insights,
    }


async def _get_meta_insights(db: AsyncSession, workspace_id: uuid.UUID, days: int = 7) -> dict | None:
    """Live counters straight from Meta — All messages / Delivered /
    delivery rate — same numbers as WhatsApp Manager > Insights, for
    the selected period, plus the connected phone number's live
    health (quality rating, verified name, status). Returns None
    (never raises) if account isn't connected or Meta call fails, so
    the dashboard degrades gracefully."""
    import time
    import httpx
    from app.core.config import settings
    from app.repositories.whatsapp_repository import WhatsAppRepository
    from app.services.whatsapp_service import get_decrypted_token

    try:
        wa_repo = WhatsAppRepository(db)
        account = await wa_repo.get_by_workspace(workspace_id)
        if account is None or not account.waba_id:
            return None

        token = get_decrypted_token(account)
        now_ts = int(time.time())
        start_ts = now_ts - days * 86400
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=12) as client:
            analytics_resp = await client.get(
                f"{settings.graph_api_base}/{account.waba_id}",
                params={"fields": f"analytics.start({start_ts}).end({now_ts}).granularity(DAY)"},
                headers=headers,
            )
            # Phone number health — quality rating, verified name, status
            phone_resp = None
            if account.phone_number_id:
                phone_resp = await client.get(
                    f"{settings.graph_api_base}/{account.phone_number_id}",
                    params={"fields": "display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type"},
                    headers=headers,
                )

        if analytics_resp.status_code != 200:
            return None

        data = analytics_resp.json().get("analytics", {})
        points = data.get("data_points", [])
        total_sent = sum(p.get("sent", 0) for p in points)
        total_delivered = sum(p.get("delivered", 0) for p in points)

        phone_health = None
        if phone_resp is not None and phone_resp.status_code == 200:
            pd = phone_resp.json()
            phone_health = {
                "display_phone_number": pd.get("display_phone_number"),
                "verified_name": pd.get("verified_name"),
                "quality_rating": pd.get("quality_rating"),   # GREEN | YELLOW | RED | UNKNOWN
                "name_status": pd.get("name_status"),
                "code_verification_status": pd.get("code_verification_status"),
            }

        return {
            "period_days": days,
            "sent": total_sent,
            "delivered": total_delivered,
            "delivery_rate": round(total_delivered / total_sent * 100, 1) if total_sent else None,
            "daily": [
                {
                    "date": datetime.fromtimestamp(p["start"], tz=timezone.utc).strftime("%d %b"),
                    "sent": p.get("sent", 0),
                    "delivered": p.get("delivered", 0),
                }
                for p in points
            ],
            "phone_health": phone_health,
        }
    except Exception:
        return None