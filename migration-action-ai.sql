-- ═══════════════════════════════════════════════════════════════
-- Dennx WA SaaS — Action-Taking AI Migration
-- Run this ONCE on production before deploying the new backend code.
-- Safe to re-run (all statements use IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

-- business_category on ai_settings — drives the auto-expert persona
-- + category-suggested tools for the AI Chatbot.
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS business_category VARCHAR(64);

-- ═══════════════════════════════════════════════════════════════
-- Verify:
--   \d ai_settings   -- should show business_category column
-- ═══════════════════════════════════════════════════════════════