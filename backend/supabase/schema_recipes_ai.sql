-- FreshTrack HK — AI Recipe Write-back & Data Contract Alignment (Incremental Migration)
-- 1) recipes.source distinguishes seed/local templates ('local') from AI-generated saves ('ai').
-- 2) save_recipe(): controlled SECURITY DEFINER write path so the client can persist an
--    AI-generated (or lightly edited) recipe even though recipes has SELECT-only RLS.
-- Run after schema.sql + schema_rls.sql.

-- 1. recipes.source (idempotent; fresh installs already include it via schema.sql)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_source_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_source_check CHECK (source IN ('local', 'ai'));

-- 2. Controlled write-back for AI recipes (bypasses SELECT-only RLS via SECURITY DEFINER).
CREATE OR REPLACE FUNCTION save_recipe(
    p_title TEXT,
    p_prep_time_min INT,
    p_difficulty TEXT,
    p_servings INT,
    p_ingredients JSONB,
    p_steps JSONB,
    p_tags TEXT[] DEFAULT '{}',
    p_source TEXT DEFAULT 'ai'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID := uuid_generate_v4();
BEGIN
    IF p_title IS NULL OR trim(p_title) = '' THEN
        RAISE EXCEPTION 'title is required';
    END IF;
    IF p_source NOT IN ('local', 'ai') THEN
        RAISE EXCEPTION 'source must be local or ai';
    END IF;

    INSERT INTO recipes (id, title, prep_time_min, difficulty, servings, ingredients, steps, tags, source)
    VALUES (
        v_id,
        p_title,
        COALESCE(p_prep_time_min, 15),
        COALESCE(p_difficulty, 'Easy'),
        COALESCE(p_servings, 2),
        p_ingredients,
        p_steps,
        COALESCE(p_tags, '{}'::TEXT[]),
        p_source
    );

    RETURN jsonb_build_object('id', v_id, 'title', p_title, 'source', p_source);
END;
$$;

REVOKE EXECUTE ON FUNCTION save_recipe(TEXT, INT, TEXT, INT, JSONB, JSONB, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recipe(TEXT, INT, TEXT, INT, JSONB, JSONB, TEXT[], TEXT) TO authenticated;
