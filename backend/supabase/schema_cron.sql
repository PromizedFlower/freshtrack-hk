-- FreshTrack HK — P2-2 Daily Expiry Scan (Incremental Migration)
-- Recomputes every item's risk level (aligned with evaluate_risk) and enqueues expiry
-- notifications for high-risk items. Scheduled via pg_cron at 08:00 daily.

CREATE OR REPLACE FUNCTION refresh_risk_and_enqueue_notifications()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v RECORD;
BEGIN
    -- Recompute stored risk for all in-stock items (view is always live, this keeps the column in sync).
    UPDATE fridge_items
    SET risk_level = evaluate_risk(expiry_date, date_type),
        updated_at = NOW();

    -- Enqueue an in-app expiry alert for each high-risk item, per household member.
    FOR v IN
        SELECT fi.household_id, fi.name, fi.expiry_date, fi.date_type, hm.user_id
        FROM fridge_items fi
        JOIN household_members hm ON hm.household_id = fi.household_id
        WHERE fi.status = 'in_stock'
          AND evaluate_risk(fi.expiry_date, fi.date_type) = 'high'
    LOOP
        INSERT INTO notifications (
            household_id, user_id, channel, type, title, body, payload
        ) VALUES (
            v.household_id, v.user_id, 'in_app', 'expiry_alert',
            '即将到期: ' || v.name,
            v.name || ' 将于 ' || v.expiry_date::text || ' 到期（' || v.date_type || '）。',
            jsonb_build_object('item', v.name, 'expiry_date', v.expiry_date, 'date_type', v.date_type)
        );
    END LOOP;
END;
$$;

-- Register the pg_cron job (no-op if the pg_cron extension is unavailable).
-- NOTE: use distinct dollar-quote tags — a nested $$ would close the outer $$ early.
DO $cron$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        PERFORM cron.schedule(
            'daily-expiry-scan',
            '0 8 * * *',
            $sql$SELECT refresh_risk_and_enqueue_notifications();$sql$
        );
    END IF;
END $cron$;
