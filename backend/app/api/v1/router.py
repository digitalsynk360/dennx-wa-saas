"""
Versioned API router — Phase 1-13 complete.

  Phase 2  -> auth          /api/v1/auth
  Phase 3  -> workspaces     /api/v1/workspaces
  Phase 4  -> conversations  /api/v1/conversations  + /api/v1/ws/{workspace_id}
  Phase 5  -> whatsapp       /api/v1/whatsapp       + /api/v1/webhooks/whatsapp
  Phase 6  -> contacts       /api/v1/contacts       + /api/v1/tags
  Phase 7  -> campaigns      /api/v1/campaigns
  Phase 8  -> templates      /api/v1/templates
  Phase 9  -> chatbot        /api/v1/chatbot/rules
  Phase 10 -> flows          /api/v1/flows
  Phase 11 -> ai             /api/v1/ai
  Phase 12 -> analytics      /api/v1/analytics
  Phase 13 -> billing        /api/v1/billing
           -> api keys       /api/v1/api-keys
           -> notifications  /api/v1/notifications
           -> agents         /api/v1/agents
"""
from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.workspaces import router as workspaces_router
from app.api.v1.endpoints.whatsapp import router as whatsapp_router, webhook_router
from app.api.v1.endpoints.conversations import router as conversations_router, ws_router
from app.api.v1.endpoints.contacts import router as contacts_router, tags_router
from app.api.v1.endpoints.campaigns import router as campaigns_router
from app.api.v1.endpoints.templates import router as templates_router
from app.api.v1.endpoints.chatbot import router as chatbot_router
from app.api.v1.endpoints.flows import router as flows_router
from app.api.v1.endpoints.ai import router as ai_router
from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.billing import router as billing_router
from app.api.v1.endpoints.api_keys import router as api_keys_router
from app.api.v1.endpoints.notifications import router as notifications_router
from app.api.v1.endpoints.agents import router as agents_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(workspaces_router)
api_router.include_router(whatsapp_router)
api_router.include_router(webhook_router)
api_router.include_router(conversations_router)
api_router.include_router(ws_router)
api_router.include_router(contacts_router)
api_router.include_router(tags_router)
api_router.include_router(campaigns_router)
api_router.include_router(templates_router)
api_router.include_router(chatbot_router)
api_router.include_router(flows_router)
api_router.include_router(ai_router)
api_router.include_router(analytics_router)
api_router.include_router(billing_router)
api_router.include_router(api_keys_router)
api_router.include_router(notifications_router)
api_router.include_router(agents_router)


@api_router.get("/ping", tags=["system"])
async def ping() -> dict:
    return {"pong": True}
