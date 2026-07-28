-- ═══════════════════════════════════════════════════════════════
-- Dennx WA SaaS — Pricing System Migration
-- Run this ONCE on production before deploying the new backend code.
-- Safe to re-run (all statements use IF NOT EXISTS / IF EXISTS).
-- ═══════════════════════════════════════════════════════════════

-- 1) Subscriptions table — add new columns
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS contact_limit INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS whatsapp_number_limit INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ai_chatbot_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '{}';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS base_price_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gst_percent INTEGER NOT NULL DEFAULT 18;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing subscriptions default to plan='free' — migrate them to a
-- sensible state: mark trial_used=true (so they don't get an
-- unexpected free trial) and leave status as-is. Superadmin should
-- review and assign real plans afterward.
UPDATE subscriptions SET trial_used = TRUE WHERE plan = 'free';

-- 2) Invoices table — add GST breakdown columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_amount INTEGER NOT NULL DEFAULT 0;

-- Backfill: for any existing invoices, treat the old `amount` as the
-- subtotal (no GST was tracked before this migration).
UPDATE invoices SET subtotal = amount WHERE subtotal = 0 AND amount > 0;

-- 3) Platform audit logs (superadmin actions) — from an earlier round,
-- included here too in case it was somehow missed.
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_platform_audit_created ON platform_audit_logs(created_at);

-- 4) Demo requests (public lead capture — replaces open signup)
CREATE TABLE IF NOT EXISTS demo_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255) NOT NULL,
    business_type VARCHAR(128),
    message TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    admin_notes TEXT,
    contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_demo_requests_status ON demo_requests(status);
CREATE INDEX IF NOT EXISTS ix_demo_requests_created ON demo_requests(created_at);

-- 5) campaign_recipients.retry_count (from an earlier round — included
-- here too in case it was missed on some environments).
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- Verify — run this after the above to confirm everything applied:
--   \d subscriptions
--   \d invoices
--   \d demo_requests
--   \d platform_audit_logs
-- ═══════════════════════════════════════════════════════════════