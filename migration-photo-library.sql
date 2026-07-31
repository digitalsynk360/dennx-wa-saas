-- ═══════════════════════════════════════════════════════════════
-- Dennx WA SaaS — Photo Library Migration (3-option itinerary photos)
-- Run this ONCE on production before deploying the new backend code.
-- Safe to re-run (uses IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS business_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    tag VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
    image_bytes BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_business_photos_workspace ON business_photos(workspace_id);

-- ═══════════════════════════════════════════════════════════════
-- Verify: \d business_photos
-- ═══════════════════════════════════════════════════════════════