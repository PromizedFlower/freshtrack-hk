-- FreshTrack HK — P3-3 Nutrition / Allergy Profile (Incremental Migration)
-- Extends profiles with a health profile that overlays recipe recommendations.

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS dietary_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS allergies TEXT[] NOT NULL DEFAULT '{}';

-- Helper: list allergies for a user (empty array if none).
CREATE OR REPLACE FUNCTION user_allergies(p_user UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(p.allergies, '{}') FROM profiles p WHERE p.id = p_user;
$$;

-- Helper: dietary flags for a user.
CREATE OR REPLACE FUNCTION user_dietary_prefs(p_user UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(p.dietary_prefs, '{}'::jsonb) FROM profiles p WHERE p.id = p_user;
$$;
