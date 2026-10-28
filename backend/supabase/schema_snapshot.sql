-- FreshTrack HK — P3-4 Fridge Shelf Snapshot (Incremental Migration)
-- Stores periodic fridge photos and the items detected from them, powering the
-- snapshot-diff feature that flags unlogged/forgotten items.

CREATE TABLE IF NOT EXISTS fridge_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    image_url TEXT,
    detected_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fridge_snapshots_household ON fridge_snapshots (household_id, created_at DESC);

-- Household members can read and create their own snapshots.
ALTER TABLE fridge_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS snapshots_select ON fridge_snapshots;
CREATE POLICY snapshots_select ON fridge_snapshots
    FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS snapshots_insert ON fridge_snapshots;
CREATE POLICY snapshots_insert ON fridge_snapshots
    FOR INSERT WITH CHECK (is_household_member(household_id));
