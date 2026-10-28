-- FreshTrack HK — P2-1 Barcode Cache (Incremental Migration)
-- Local cache for Open Food Facts lookups: millisecond read on repeat scans.

CREATE TABLE IF NOT EXISTS barcode_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barcode TEXT NOT NULL UNIQUE,
    name TEXT,
    brand TEXT,
    net_content TEXT,
    category TEXT,
    image_url TEXT,
    source TEXT NOT NULL DEFAULT 'openfoodfacts',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barcode_cache_barcode ON barcode_cache (barcode);

-- Cache is a shared read-only reference for authenticated users; writes come from the
-- service-role edge function (which bypasses RLS).
ALTER TABLE barcode_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS barcode_cache_read ON barcode_cache;
CREATE POLICY barcode_cache_read ON barcode_cache
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_barcode_cache_updated_at ON barcode_cache;
CREATE TRIGGER trg_barcode_cache_updated_at
    BEFORE UPDATE ON barcode_cache
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
