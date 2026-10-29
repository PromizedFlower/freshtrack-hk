-- FreshTrack HK — P2-3 Notification Channel Abstraction (Incremental Migration)
-- A pluggable notification model: expiry alerts are enqueued as rows, then dispatched by
-- the notify edge function across any channel (WeChat subscribe / Web Push / email / in-app).

-- NOTE: PostgreSQL does not support CREATE TYPE IF NOT EXISTS — use a DO block instead.
DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('wechat_subscribe', 'web_push', 'email', 'in_app');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel notification_channel NOT NULL DEFAULT 'in_app',
    type TEXT NOT NULL DEFAULT 'expiry_alert',
    title TEXT NOT NULL,
    body TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status notification_status NOT NULL DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_dispatch
    ON notifications (household_id, status, scheduled_for);

-- Users can see (and dismiss) their own household notifications; writes via service role.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
    FOR SELECT
    USING (is_household_member(household_id));

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
    FOR UPDATE
    USING (is_household_member(household_id))
    WITH CHECK (is_household_member(household_id));
