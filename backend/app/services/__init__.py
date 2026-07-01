"""
Service layer (Clean Architecture / use cases). Routers stay thin,
repositories own SQL, services own business logic. Added phase by phase:

  auth_service          Phase 2
  workspace_service      Phase 3
  meta_oauth_service     Phase 4   Embedded Signup code exchange
  webhook_processor       Phase 4   inbound message pipeline
  message_service        Phase 6
  contact_service        Phase 7
  campaign_dispatcher    Phase 8
  template_service       Phase 9
  chatbot_engine         Phase 10/11
  ai_runner              Phase 12
"""
