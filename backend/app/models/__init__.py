"""
Import every model so Base.metadata reflects the full schema —
required for Alembic autogenerate and for relationship resolution.
"""
from app.models.base import Base
from app.models.identity import (
    Permission,
    Role,
    RolePermission,
    User,
    Workspace,
    WorkspaceMember,
)
from app.models.whatsapp import WhatsAppAccount
from app.models.contact import Contact, ContactTag, Tag
from app.models.messaging import Conversation, Message
from app.models.template import Template
from app.models.campaign import Campaign, CampaignRecipient
from app.models.automation import Automation, ChatbotFlow, ChatbotRule, FlowSession
from app.models.crm import CRMLead, CRMTask, Ticket
from app.models.billing import Invoice, Subscription
from app.models.platform import AuditLog, KnowledgeDocument, OutboundWebhook
from app.models.api_key import ApiKey
from app.models.flow_builder import ExecutionLog, FlowExecution, FlowVersion

__all__ = [
    "Base",
    "User",
    "Workspace",
    "WorkspaceMember",
    "Role",
    "Permission",
    "RolePermission",
    "WhatsAppAccount",
    "Contact",
    "Tag",
    "ContactTag",
    "Conversation",
    "Message",
    "Template",
    "Campaign",
    "CampaignRecipient",
    "ChatbotRule",
    "ChatbotFlow",
    "FlowSession",
    "Automation",
    "CRMLead",
    "CRMTask",
    "Ticket",
    "Subscription",
    "Invoice",
    "AuditLog",
    "OutboundWebhook",
    "KnowledgeDocument",
    "ApiKey",
    "FlowVersion",
    "FlowExecution",
    "ExecutionLog",
]