-- FreshTrack HK - Consolidated One-shot Migration (fresh install)
-- Run this ONCE in Supabase SQL Editor against an empty database.
-- Order: base -> auth -> RLS -> risk -> cook -> sdg -> barcode -> notify -> cron -> seeds.
-- Schema DDL is idempotent; the two seed INSERT sections are NOT (re-running duplicates rows).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================== schema.sql =====================
-- FreshTrack HK Core PostgreSQL Schema (Supabase BaaS)
-- Supports Household Multi-user Sync, Spoilage Risk Engine, Rescue Recipes & SDG 12.3 Impact Tracking

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Households (家庭/个人冰箱账本表)
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'My FreshTrack Fridge',
    owner_id UUID,
    invite_code TEXT UNIQUE DEFAULT substring(md5(random()::text) from 1 for 6),
    monthly_budget_hkd NUMERIC(10, 2) DEFAULT 3500.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Storage Rules Knowledge Base (权威生鲜储存规则字典表 - 源自 USDA FoodKeeper & 香港食安中心)
CREATE TABLE IF NOT EXISTS storage_rules (
    id SERIAL PRIMARY KEY,
    keyword_en TEXT NOT NULL,
    keyword_zh TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Produce', 'Dairy', 'Meat', 'Bakery', 'Pantry')),
    default_zone TEXT NOT NULL CHECK (default_zone IN ('fridge', 'freezer', 'pantry')),
    shelf_life_days INT NOT NULL,
    default_date_type TEXT NOT NULL CHECK (default_date_type IN ('best_before', 'use_by')),
    avg_price_hkd_per_kg NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    co2e_kg_per_kg NUMERIC(6, 3) NOT NULL DEFAULT 1.280,
    storage_tip TEXT
);

-- 3. Fridge Items (冰箱在库食材明细表)
CREATE TABLE IF NOT EXISTS fridge_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Produce', 'Dairy', 'Meat', 'Bakery', 'Pantry')),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'pcs',
    weight_grams INT NOT NULL DEFAULT 200,
    price_hkd NUMERIC(10, 2) DEFAULT 0.00,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE NOT NULL,
    date_type TEXT NOT NULL CHECK (date_type IN ('best_before', 'use_by')),
    is_date_estimated BOOLEAN NOT NULL DEFAULT FALSE,
    storage_zone TEXT NOT NULL DEFAULT 'fridge' CHECK (storage_zone IN ('fridge', 'freezer', 'pantry')),
    risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('high', 'medium', 'low')),
    suggested_action TEXT DEFAULT 'Plan meal',
    status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'consumed', 'discarded')),
    source_method TEXT NOT NULL DEFAULT 'manual' CHECK (source_method IN ('receipt', 'photo', 'barcode', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fridge_items_lookup ON fridge_items (household_id, status, expiry_date ASC);

-- 4. Rescue Recipes (抢救菜谱库表)
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    prep_time_min INT NOT NULL DEFAULT 15,
    difficulty TEXT NOT NULL DEFAULT 'Easy',
    servings INT NOT NULL DEFAULT 2,
    ingredients JSONB NOT NULL, -- e.g. [{"name": "Baby Spinach", "category": "Produce", "weight_g": 200, "required": true}]
    steps JSONB NOT NULL,       -- e.g. ["Wash spinach...", "Pan-sear chicken breast..."]
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Waste & SDG 12.3 Impact Logs (减废与碳排行为流水表)
CREATE TABLE IF NOT EXISTS waste_impact_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    item_id UUID REFERENCES fridge_items(id) ON DELETE SET NULL,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('rescued_by_recipe', 'consumed_direct', 'expired_discarded')),
    weight_grams INT NOT NULL,
    money_saved_hkd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    co2e_avoided_kg NUMERIC(8, 3) NOT NULL DEFAULT 0.000,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waste_logs_month ON waste_impact_logs (household_id, logged_at DESC);

-- ===================== schema_auth.sql =====================
-- FreshTrack HK — P0-1 Auth & Multi-tenant Schema (Incremental Migration)
-- Run AFTER schema.sql. Safe to re-run: all objects use IF NOT EXISTS / additive only.
-- Purpose: bind Supabase Auth (auth.users), add member model, and an owner FK so
--          RLS (P0-2) can isolate every household's data.

-- 1. profiles: 1:1 mirror of auth.users, holds app-level user metadata.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT 'FreshTrack User',
    avatar_url TEXT,
    locale TEXT NOT NULL DEFAULT 'zh-HK' CHECK (locale IN ('zh-HK', 'en', 'zh-CN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. household_members: enables invite-code sharing (V2) and RLS membership checks.
CREATE TYPE IF NOT EXISTS household_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE IF NOT EXISTS household_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role household_role NOT NULL DEFAULT 'editor',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (household_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_user
    ON household_members (user_id, household_id);

-- 3. Bind households.owner_id to auth.users (existing NULL rows remain valid).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_households_owner'
          AND table_name = 'households'
    ) THEN
        ALTER TABLE households
            ADD CONSTRAINT fk_households_owner
            FOREIGN KEY (owner_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- 4. Helper: is the current auth user a member of a given household?
--    Used by RLS policies (P0-2) for performant membership checks.
CREATE OR REPLACE FUNCTION is_household_member(target_household UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = target_household
          AND hm.user_id = auth.uid()
    );
$$;

-- 5. Trigger to keep profiles.updated_at fresh (reused pattern for other tables later).
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 6. Auto-provision a profile row on new auth user (keeps profiles in sync).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'FreshTrack User'))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 7. When a household is created, seed the owner as a household_members row
--    (so RLS membership checks work immediately for single-user households too).
CREATE OR REPLACE FUNCTION handle_new_household()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.owner_id IS NOT NULL THEN
        INSERT INTO public.household_members (household_id, user_id, role)
        VALUES (NEW.id, NEW.owner_id, 'owner')
        ON CONFLICT (household_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_household_created ON households;
CREATE TRIGGER trg_on_household_created
    AFTER INSERT ON households
    FOR EACH ROW EXECUTE FUNCTION handle_new_household();

-- ===================== schema_rls.sql =====================
-- FreshTrack HK — P0-2 Row Level Security (Incremental Migration)
-- Run AFTER schema.sql + schema_auth.sql.
-- Guarantees: a user can only read/write rows belonging to a household they are a
-- member of. Reference (read-only) tables are open to all authenticated users.

-- ============ 1. profiles (user owns their own row; co-members can view) ============
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self ON profiles;
CREATE POLICY profiles_select_self ON profiles
    FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_co_member ON profiles;
CREATE POLICY profiles_select_co_member ON profiles
    FOR SELECT
    USING (
        id <> auth.uid()
        AND EXISTS (
            SELECT 1 FROM household_members a
            JOIN household_members b ON a.household_id = b.household_id
            WHERE a.user_id = auth.uid() AND b.user_id = profiles.id
        )
    );

DROP POLICY IF EXISTS profiles_update_self ON profiles;
CREATE POLICY profiles_update_self ON profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_self ON profiles;
CREATE POLICY profiles_insert_self ON profiles
    FOR INSERT
    WITH CHECK (id = auth.uid());

-- ============ 2. households (members can read; owner manages) ============
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS households_select_member ON households;
CREATE POLICY households_select_member ON households
    FOR SELECT
    USING (is_household_member(id));

DROP POLICY IF EXISTS households_insert_owner ON households;
CREATE POLICY households_insert_owner ON households
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS households_update_owner ON households;
CREATE POLICY households_update_owner ON households
    FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = households.id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = households.id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ));

DROP POLICY IF EXISTS households_delete_owner ON households;
CREATE POLICY households_delete_owner ON households
    FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = households.id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ));

-- ============ 3. fridge_items (scoped by household membership) ============
ALTER TABLE fridge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fridge_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fridge_items_select ON fridge_items;
CREATE POLICY fridge_items_select ON fridge_items
    FOR SELECT
    USING (is_household_member(household_id));

DROP POLICY IF EXISTS fridge_items_insert ON fridge_items;
CREATE POLICY fridge_items_insert ON fridge_items
    FOR INSERT
    WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS fridge_items_update ON fridge_items;
CREATE POLICY fridge_items_update ON fridge_items
    FOR UPDATE
    USING (is_household_member(household_id))
    WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS fridge_items_delete ON fridge_items;
CREATE POLICY fridge_items_delete ON fridge_items
    FOR DELETE
    USING (is_household_member(household_id));

-- ============ 4. waste_impact_logs (scoped by household membership) ============
ALTER TABLE waste_impact_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_impact_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waste_logs_select ON waste_impact_logs;
CREATE POLICY waste_logs_select ON waste_impact_logs
    FOR SELECT
    USING (is_household_member(household_id));

DROP POLICY IF EXISTS waste_logs_insert ON waste_impact_logs;
CREATE POLICY waste_logs_insert ON waste_impact_logs
    FOR INSERT
    WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS waste_logs_delete ON waste_impact_logs;
CREATE POLICY waste_logs_delete ON waste_impact_logs
    FOR DELETE
    USING (is_household_member(household_id));

-- ============ 5. household_members (members see roster; owner manages) ============
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_select ON household_members;
CREATE POLICY members_select ON household_members
    FOR SELECT
    USING (is_household_member(household_id));

DROP POLICY IF EXISTS members_insert_owner ON household_members;
CREATE POLICY members_insert_owner ON household_members
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = household_members.household_id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ));

DROP POLICY IF EXISTS members_update_owner ON household_members;
CREATE POLICY members_update_owner ON household_members
    FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = household_members.household_id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = household_members.household_id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ));

DROP POLICY IF EXISTS members_delete_owner ON household_members;
CREATE POLICY members_delete_owner ON household_members
    FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = household_members.household_id
          AND hm.user_id = auth.uid()
          AND hm.role = 'owner'
    ));

-- ============ 6. Reference tables: open read-only to all authenticated users ============
-- storage_rules and recipes are global knowledge bases, no household scoping.
ALTER TABLE storage_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_rules_read ON storage_rules;
CREATE POLICY storage_rules_read ON storage_rules
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recipes_read ON recipes;
CREATE POLICY recipes_read ON recipes
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- ===================== schema_risk.sql =====================
-- FreshTrack HK — P0-3 Dynamic Spoilage Risk (Incremental Migration)
-- Run AFTER schema.sql (+ schema_auth.sql for is_household_member if RLS applied).
-- Replaces the static fridge_items.risk_level with a deterministic, date-driven value
-- that exactly mirrors frontend/src/utils/riskCalculator.ts.

-- 1. days_left helper: whole days from NOW() until expiry (ceiling, date-only).
CREATE OR REPLACE FUNCTION days_left_until(p_expiry DATE, p_now DATE DEFAULT CURRENT_DATE)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CEIL(EXTRACT(EPOCH FROM (p_expiry::timestamp - p_now::timestamp)) / 86400)::INT;
$$;

-- 2. evaluate_risk: authoritative 3-tier spoilage scoring (NEVER certifies food safety).
--    high  : daysLeft <= 1  OR (use_by AND daysLeft <= 2)
--    medium: daysLeft <= 3   (and not high)
--    low   : otherwise
CREATE OR REPLACE FUNCTION evaluate_risk(p_expiry DATE, p_date_type TEXT, p_now DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN days_left_until(p_expiry, p_now) <= 1
          OR (p_date_type = 'use_by' AND days_left_until(p_expiry, p_now) <= 2)
            THEN 'high'
        WHEN days_left_until(p_expiry, p_now) <= 3
            THEN 'medium'
        ELSE 'low'
    END;
$$;

-- 3. suggested_action helper aligned with frontend logic.
CREATE OR REPLACE FUNCTION suggest_action(p_expiry DATE, p_date_type TEXT, p_category TEXT, p_now DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN evaluate_risk(p_expiry, p_date_type, p_now) = 'high'
            THEN CASE WHEN p_date_type = 'use_by' THEN 'Cook or freeze' ELSE 'Add to tonight' END
        WHEN evaluate_risk(p_expiry, p_date_type, p_now) = 'medium'
            THEN CASE WHEN p_category = 'Produce' THEN 'Smoothie / Stir-fry' ELSE 'Plan meal' END
        ELSE 'Keep chilled'
    END;
$$;

-- 4. Keep fridge_items.updated_at fresh on every write.
DROP TRIGGER IF EXISTS trg_fridge_items_updated_at ON fridge_items;
CREATE TRIGGER trg_fridge_items_updated_at
    BEFORE UPDATE ON fridge_items
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 5. Unified read view: live risk + days_left, overriding the static stored column.
--    All app reads for "My Fridge" / "Use Soon" should query this view.
CREATE OR REPLACE VIEW v_fridge_items_with_risk AS
SELECT
    fi.id,
    fi.household_id,
    fi.name,
    fi.category,
    fi.quantity,
    fi.unit,
    fi.weight_grams,
    fi.price_hkd,
    fi.purchase_date,
    fi.expiry_date,
    fi.date_type,
    fi.is_date_estimated,
    fi.storage_zone,
    -- live, date-driven risk (authoritative; supersedes the static column)
    evaluate_risk(fi.expiry_date, fi.date_type) AS risk_level,
    days_left_until(fi.expiry_date) AS days_left,
    suggest_action(fi.expiry_date, fi.date_type, fi.category) AS suggested_action,
    fi.status,
    fi.source_method,
    fi.created_at,
    fi.updated_at
FROM fridge_items fi
WHERE fi.status = 'in_stock';

-- 6. Backfill: align the stored risk_level column with the live formula (one-off).
UPDATE fridge_items
SET risk_level = evaluate_risk(expiry_date, date_type),
    updated_at = NOW();

-- ===================== schema_cook.sql =====================
-- FreshTrack HK — P1-4 Cook / Consume Transaction (Incremental Migration)
-- Atomic Postgres function invoked by the cook-recipe edge function. Deducts stock and
-- writes SDG 12.3 impact logs in one transaction. Money / CO2e come from actual price when
-- available, else from storage_rules / category averages (PRD Section 3.3).

-- Category reference averages (HK$ per kg, CO2e kg per kg) for fallback valuation.
CREATE OR REPLACE FUNCTION category_price_hkd(p_category TEXT) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_category
        WHEN 'Produce' THEN 35 WHEN 'Dairy' THEN 45 WHEN 'Meat' THEN 120
        WHEN 'Bakery' THEN 50 ELSE 40 END;
$$;

CREATE OR REPLACE FUNCTION category_co2e(p_category TEXT) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_category
        WHEN 'Produce' THEN 0.5 WHEN 'Dairy' THEN 1.8 WHEN 'Meat' THEN 4.0
        WHEN 'Bakery' THEN 1.0 ELSE 1.5 END;
$$;

CREATE OR REPLACE FUNCTION consume_for_recipe(
    p_household UUID,
    p_recipe UUID,
    p_item_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
    v_weight INT;
    v_money NUMERIC;
    v_co2 NUMERIC;
    v_rule RECORD;
    v_total_kg NUMERIC := 0;
    v_total_hkd NUMERIC := 0;
    v_total_co2 NUMERIC := 0;
BEGIN
    -- Lock and process each confirmed item atomically.
    FOR v_item IN
        SELECT * FROM fridge_items
        WHERE id = ANY(p_item_ids)
          AND household_id = p_household
          AND status = 'in_stock'
        FOR UPDATE
    LOOP
        v_weight := v_item.weight_grams;

        -- Valuation: prefer scanned price, else rule price, else category average.
        SELECT * INTO v_rule FROM storage_rules
        WHERE lower(keyword_en) = lower(v_item.name)
           OR keyword_en ILIKE '%' || v_item.name || '%'
        LIMIT 1;

        IF v_item.price_hkd IS NOT NULL AND v_item.price_hkd > 0 THEN
            v_money := v_item.price_hkd;
        ELSIF v_rule IS NOT NULL THEN
            v_money := v_rule.avg_price_hkd_per_kg * (v_weight::NUMERIC / 1000);
        ELSE
            v_money := category_price_hkd(v_item.category) * (v_weight::NUMERIC / 1000);
        END IF;

        IF v_rule IS NOT NULL THEN
            v_co2 := v_rule.co2e_kg_per_kg * (v_weight::NUMERIC / 1000);
        ELSE
            v_co2 := category_co2e(v_item.category) * (v_weight::NUMERIC / 1000);
        END IF;

        INSERT INTO waste_impact_logs (
            household_id, item_id, recipe_id, action_type,
            weight_grams, money_saved_hkd, co2e_avoided_kg
        ) VALUES (
            p_household, v_item.id, p_recipe, 'rescued_by_recipe',
            v_weight, ROUND(v_money, 2), ROUND(v_co2, 3)
        );

        UPDATE fridge_items
        SET status = 'consumed',
            risk_level = 'low',
            updated_at = NOW()
        WHERE id = v_item.id;

        v_total_kg := v_total_kg + (v_weight::NUMERIC / 1000);
        v_total_hkd := v_total_hkd + v_money;
        v_total_co2 := v_total_co2 + v_co2;
    END LOOP;

    RETURN jsonb_build_object(
        'consumed_count', array_length(p_item_ids, 1),
        'month_saved_kg', ROUND(v_total_kg, 2),
        'month_saved_hkd', ROUND(v_total_hkd, 2),
        'co2e_kg', ROUND(v_total_co2, 3)
    );
END;
$$;

-- Convenience: direct "mark consumed" (no recipe) used by My Fridge manual核销.
CREATE OR REPLACE FUNCTION consume_direct(
    p_household UUID,
    p_item_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
    v_weight INT;
    v_money NUMERIC;
    v_co2 NUMERIC;
    v_rule RECORD;
    v_total_kg NUMERIC := 0;
    v_total_hkd NUMERIC := 0;
    v_total_co2 NUMERIC := 0;
BEGIN
    FOR v_item IN
        SELECT * FROM fridge_items
        WHERE id = ANY(p_item_ids) AND household_id = p_household AND status = 'in_stock'
        FOR UPDATE
    LOOP
        v_weight := v_item.weight_grams;
        SELECT * INTO v_rule FROM storage_rules
        WHERE lower(keyword_en) = lower(v_item.name) OR keyword_en ILIKE '%' || v_item.name || '%' LIMIT 1;

        IF v_item.price_hkd IS NOT NULL AND v_item.price_hkd > 0 THEN
            v_money := v_item.price_hkd;
        ELSIF v_rule IS NOT NULL THEN
            v_money := v_rule.avg_price_hkd_per_kg * (v_weight::NUMERIC / 1000);
        ELSE
            v_money := category_price_hkd(v_item.category) * (v_weight::NUMERIC / 1000);
        END IF;
        v_co2 := CASE WHEN v_rule IS NOT NULL THEN v_rule.co2e_kg_per_kg ELSE category_co2e(v_item.category) END
                * (v_weight::NUMERIC / 1000);

        INSERT INTO waste_impact_logs (
            household_id, item_id, recipe_id, action_type,
            weight_grams, money_saved_hkd, co2e_avoided_kg
        ) VALUES (
            p_household, v_item.id, NULL, 'consumed_direct',
            v_weight, ROUND(v_money, 2), ROUND(v_co2, 3)
        );

        UPDATE fridge_items SET status = 'consumed', risk_level = 'low', updated_at = NOW() WHERE id = v_item.id;

        v_total_kg := v_total_kg + (v_weight::NUMERIC / 1000);
        v_total_hkd := v_total_hkd + v_money;
        v_total_co2 := v_total_co2 + v_co2;
    END LOOP;

    RETURN jsonb_build_object(
        'month_saved_kg', ROUND(v_total_kg, 2),
        'month_saved_hkd', ROUND(v_total_hkd, 2),
        'co2e_kg', ROUND(v_total_co2, 3)
    );
END;
$$;

-- ===================== schema_sdg.sql =====================
-- FreshTrack HK — P1-5 SDG 12.3 Impact Aggregation (Incremental Migration)
-- Parameterized functions powering the Dashboard KPI cards and Impact 6-month chart.

-- Current calendar month start (HK/local).
CREATE OR REPLACE FUNCTION month_start(p_date DATE DEFAULT CURRENT_DATE)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
    SELECT date_trunc('month', p_date)::DATE;
$$;

-- Monthly KPI snapshot for one household.
CREATE OR REPLACE FUNCTION get_household_kpi(p_household UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'total_tracked', (
            SELECT COUNT(*) FROM fridge_items
            WHERE household_id = p_household AND status = 'in_stock'
        ),
        'expiring_soon', (
            SELECT COUNT(*) FROM fridge_items
            WHERE household_id = p_household AND status = 'in_stock'
              AND evaluate_risk(expiry_date, date_type) = 'high'
        ),
        'month_saved_kg', COALESCE((
            SELECT ROUND(SUM(weight_grams) / 1000.0, 2) FROM waste_impact_logs
            WHERE household_id = p_household
              AND action_type IN ('rescued_by_recipe', 'consumed_direct')
              AND logged_at >= month_start()
        ), 0),
        'month_saved_hkd', COALESCE((
            SELECT ROUND(SUM(money_saved_hkd), 2) FROM waste_impact_logs
            WHERE household_id = p_household
              AND action_type IN ('rescued_by_recipe', 'consumed_direct')
              AND logged_at >= month_start()
        ), 0),
        'co2e_kg', COALESCE((
            SELECT ROUND(SUM(co2e_avoided_kg), 3) FROM waste_impact_logs
            WHERE household_id = p_household
              AND action_type IN ('rescued_by_recipe', 'consumed_direct')
              AND logged_at >= month_start()
        ), 0)
    );
$$;

-- Last 6 calendar months trend (kg saved / hkd saved / co2e avoided) per month.
CREATE OR REPLACE FUNCTION get_household_trend(p_household UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'month', to_char(m, 'YYYY-MM'),
                'saved_kg', ROUND(COALESCE(s.kg, 0), 2),
                'saved_hkd', ROUND(COALESCE(s.hkd, 0), 2),
                'co2e_kg', ROUND(COALESCE(s.co2, 0), 3)
            )
            ORDER BY m
        ),
        '[]'::jsonb
    )
    FROM generate_series(
        month_start() - INTERVAL '5 months',
        month_start(),
        INTERVAL '1 month'
    ) AS m
    LEFT JOIN (
        SELECT date_trunc('month', logged_at) AS mon,
               SUM(weight_grams)/1000.0 AS kg,
               SUM(money_saved_hkd) AS hkd,
               SUM(co2e_avoided_kg) AS co2
        FROM waste_impact_logs
        WHERE household_id = p_household
          AND action_type IN ('rescued_by_recipe', 'consumed_direct')
        GROUP BY date_trunc('month', logged_at)
    ) s ON s.mon = m;
$$;

-- ===================== schema_barcode.sql =====================
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

-- ===================== schema_notify.sql =====================
-- FreshTrack HK — P2-3 Notification Channel Abstraction (Incremental Migration)
-- A pluggable notification model: expiry alerts are enqueued as rows, then dispatched by
-- the notify edge function across any channel (WeChat subscribe / Web Push / email / in-app).

CREATE TYPE IF NOT EXISTS notification_channel AS ENUM ('wechat_subscribe', 'web_push', 'email', 'in_app');
CREATE TYPE IF NOT EXISTS notification_status AS ENUM ('pending', 'sent', 'failed');

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

-- ===================== schema_cron.sql =====================
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
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        PERFORM cron.schedule(
            'daily-expiry-scan',
            '0 8 * * *',
            $$SELECT refresh_risk_and_enqueue_notifications();$$
        );
    END IF;
END $$;

-- ===================== seed_storage_rules_expanded.sql =====================
-- FreshTrack HK — Expanded Seed: Storage Rules (150+) & Rescue Recipes (30+)
-- Additive. Run AFTER seed_storage_rules.sql (the original 9 rows remain).
-- Sources: USDA FSIS FoodKeeper + Hong Kong CFS cold-chain guidance.
-- date_type: 'use_by' = safety-critical (raw meat, fresh milk, RTE fish, tofu);
--            'best_before' = quality-based (produce, bakery, yoghurt, pantry).
-- zone: 'fridge' (0-4C) | 'freezer' (-18C) | 'pantry' (cool dry).
-- price_hkd = avg per kg; co2e_kg_per_kg = lifecycle carbon factor.

INSERT INTO storage_rules (keyword_en, keyword_zh, category, default_zone, shelf_life_days, default_date_type, avg_price_hkd_per_kg, co2e_kg_per_kg, storage_tip) VALUES
-- ===================== PRODUCE (fridge / pantry) =====================
('Lettuce','生菜','Produce','fridge',7,'best_before',28.00,0.50,'Wash only before use; keep in crisper with a damp towel.'),
('Iceberg Lettuce','结球生菜','Produce','fridge',10,'best_before',26.00,0.50,'Store whole; cut surface browns fast.'),
('Cabbage','椰菜 / 包菜','Produce','fridge',21,'best_before',18.00,0.40,'Whole head keeps weeks; wrap cut side in cling film.'),
('Chinese Cabbage','大白菜','Produce','fridge',14,'best_before',16.00,0.40,'Store upright in crisper, do not wash before storing.'),
('Choy Sum','菜心','Produce','fridge',3,'best_before',22.00,0.45,'Use within 2-3 days; keep stems in water like flowers.'),
('Gai Lan','芥兰','Produce','fridge',4,'best_before',24.00,0.45,'Blanch quickly; best eaten fresh.'),
('Water Spinach','通菜 / 空心菜','Produce','fridge',2,'best_before',20.00,0.45,'Very perishable; use same day if possible.'),
('Bok Choy','小白菜','Produce','fridge',4,'best_before',20.00,0.45,'Keep dry in crisper drawer.'),
('Kai-lan','芥蓝','Produce','fridge',4,'best_before',24.00,0.45,'Use quickly after purchase.'),
('Spinach','菠菜','Produce','fridge',4,'best_before',30.00,1.10,'Keep dry; excess moisture speeds spoilage.'),
('Baby Spinach','嫩菠菜 / 沙拉菠菜','Produce','fridge',4,'best_before',65.00,1.10,'Keep dry with a paper towel in crisper drawer.'),
('Broccoli','西兰花','Produce','fridge',5,'best_before',30.00,0.45,'Store in perforated bag; do not wash until use.'),
('Cauliflower','椰菜花','Produce','fridge',7,'best_before',26.00,0.45,'Stores longer than broccoli.'),
('Asparagus','芦笋','Produce','fridge',4,'best_before',60.00,0.55,'Stand upright in shallow water in fridge.'),
('Green Beans','青豆角','Produce','fridge',5,'best_before',40.00,0.60,'Keep in pod; trim ends before cooking.'),
('Snow Peas','荷兰豆','Produce','fridge',4,'best_before',48.00,0.60,'Use promptly for best crunch.'),
('Bell Pepper','彩椒 / 青椒','Produce','fridge',10,'best_before',46.00,0.45,'Dry storage; peppers love low humidity.'),
('Capsicum Red','红甜椒','Produce','fridge',10,'best_before',52.00,0.45,'Sweeter when ripe; same storage as green.'),
('Chili','辣椒','Produce','fridge',14,'best_before',60.00,0.40,'Or dry thoroughly and store in pantry.'),
('Cucumber','青瓜 / 黄瓜','Produce','fridge',7,'best_before',20.00,0.35,'Wrap cut end to slow sogginess.'),
('Zucchini','翠玉瓜 / 西葫芦','Produce','fridge',5,'best_before',28.00,0.35,'Best used within the week.'),
('Eggplant','茄子','Produce','fridge',5,'best_before',24.00,0.40,'Sensitive to cold; use soon.'),
('Okra','秋葵','Produce','fridge',3,'best_before',50.00,0.50,'Perishes fast; dry and refrigerate.'),
('Corn','粟米 / 玉米','Produce','fridge',5,'best_before',22.00,0.45,'Sugar converts to starch; eat fresh.'),
('Cherry Tomatoes','圣女果 / 樱桃番茄','Produce','fridge',7,'best_before',42.00,0.95,'Wash only right before eating to prevent mold.'),
('Tomato','番茄','Produce','pantry',5,'best_before',24.00,0.95,'Ripen on counter, then refrigerate when soft.'),
('Carrot','红萝卜 / 胡萝卜','Produce','fridge',28,'best_before',16.00,0.35,'Remove greens; store in water or bag.'),
('Radish','萝卜 / 白萝卜','Produce','fridge',21,'best_before',14.00,0.30,'Trim leaves; keep moist.'),
('Daikon','白萝卜','Produce','fridge',21,'best_before',14.00,0.30,'Great for soups; store wrapped.'),
('Beetroot','甜菜根','Produce','fridge',21,'best_before',30.00,0.35,'Leaves separate; roots keep well.'),
('Potato','薯仔 / 土豆','Produce','pantry',60,'best_before',14.00,0.30,'Store in dark, cool, ventilated place.'),
('Sweet Potato','番薯 / 红薯','Produce','pantry',30,'best_before',18.00,0.30,'Do not refrigerate; sprouts are edible.'),
('Onion','洋葱','Produce','pantry',60,'best_before',16.00,0.25,'Cure in dry airy spot; keep from potatoes.'),
('Garlic','蒜','Produce','pantry',90,'best_before',40.00,0.25,'Dry, ventilated; avoid fridge sprouting.'),
('Ginger','姜','Produce','pantry',30,'best_before',36.00,0.30,'Or freeze peeled for long keep.'),
('Spring Onion','葱','Produce','fridge',7,'best_before',18.00,0.30,'Stand in water or wrap in damp towel.'),
('Leek','大葱 / 韭葱','Produce','fridge',10,'best_before',26.00,0.35,'Clean grit from layers before storing.'),
('Mushroom Button','白蘑菇','Produce','fridge',5,'best_before',56.00,0.70,'Paper bag, not plastic, to avoid slime.'),
('Shiitake','冬菇 / 香菇','Produce','fridge',7,'best_before',80.00,0.70,'Dry ones go to pantry for months.'),
('Enoki','金针菇','Produce','fridge',5,'best_before',40.00,0.70,'Keep sealed; use before slime forms.'),
('Strawberry','草莓','Produce','fridge',3,'best_before',80.00,0.40,'Do not wash until eating; very fragile.'),
('Blueberry','蓝莓','Produce','fridge',7,'best_before',120.00,0.50,'Rinse right before eating.'),
('Grape','葡萄','Produce','fridge',7,'best_before',50.00,0.45,'Store unwashed in perforated bag.'),
('Apple','苹果','Produce','fridge',40,'best_before',24.00,0.40,'Separate from bananas; ethylene sensitive.'),
('Pear','雪梨 / 梨','Produce','fridge',14,'best_before',30.00,0.40,'Ripen on counter then chill.'),
('Banana','香蕉','Produce','pantry',4,'best_before',18.00,0.80,'Freeze peeled overripe bananas for smoothies or baking.'),
('Mango','芒果','Produce','pantry',5,'best_before',40.00,0.60,'Ripen at room temp; refrigerate when soft.'),
('Pineapple','菠萝','Produce','pantry',4,'best_before',24.00,0.55,'Once cut, refrigerate and use in 3 days.'),
('Watermelon','西瓜','Produce','pantry',7,'best_before',12.00,0.30,'Whole keeps on counter; cut must chill.'),
('Cantaloupe','蜜瓜','Produce','pantry',5,'best_before',20.00,0.35,'Scrub rind before cutting.'),
('Grapefruit','西柚','Produce','fridge',21,'best_before',30.00,0.40,'Citrus likes cool fridge air.'),
('Orange','橙','Produce','fridge',21,'best_before',22.00,0.40,'Store in fridge to extend juice life.'),
('Lemon','柠檬','Produce','fridge',28,'best_before',30.00,0.35,'Zest before juicing for max use.'),
('Lime','青柠','Produce','fridge',21,'best_before',32.00,0.35,'Use for dressings and curries.'),
('Kiwi','奇异果','Produce','fridge',14,'best_before',60.00,0.50,'Ripen with apples; chill when soft.'),
('Papaya','木瓜','Produce','pantry',4,'best_before',28.00,0.45,'Ripen on counter, refrigerate when soft.'),
('Avocado','牛油果','Produce','pantry',4,'best_before',70.00,0.45,'Ripen in paper bag; fridge stops ripening.'),
('Green Peas','青豆','Produce','fridge',3,'best_before',40.00,0.60,'Shell and freeze surplus.'),
('Pumpkin','南瓜','Produce','pantry',60,'best_before',16.00,0.30,'Whole keeps months in pantry.'),
('Bittermelon','苦瓜','Produce','fridge',5,'best_before',22.00,0.40,'Use in soups and stir-fries.'),
('Lotus Root','莲藕','Produce','fridge',10,'best_before',34.00,0.40,'Submerge cut slices in water with vinegar.'),
('Winter Melon','冬瓜','Produce','pantry',30,'best_before',12.00,0.30,'Large; store cool and dry.'),
('Taro','芋头','Produce','pantry',30,'best_before',20.00,0.30,'Cook thoroughly; raw is irritating.'),
('Chinese Yam','淮山 / 山药','Produce','pantry',30,'best_before',28.00,0.30,'Keep dry; peel under running water.'),
-- ===================== DAIRY (fridge) =====================
('Whole Milk','鲜牛奶 (巴氏杀菌)','Dairy','fridge',5,'use_by',28.00,1.90,'Store on middle shelf, avoid fridge door temperature swings.'),
('Skim Milk','脱脂牛奶','Dairy','fridge',5,'use_by',30.00,1.90,'Same handling as whole milk.'),
('Low Fat Milk','低脂牛奶','Dairy','fridge',5,'use_by',29.00,1.90,'Keep cold at all times.'),
('Fresh Milk Carton','保鲜牛奶盒装','Dairy','fridge',7,'use_by',32.00,1.90,'UHT varieties last longer unopened.'),
('Greek Yoghurt','希腊酸奶','Dairy','fridge',10,'best_before',76.00,1.60,'Keep tightly sealed in refrigerator at 0-4C.'),
('Plain Yoghurt','原味酸奶','Dairy','fridge',10,'best_before',60.00,1.60,'Spoon from the edge to avoid contamination.'),
('Flavored Yoghurt','果味酸奶','Dairy','fridge',14,'best_before',68.00,1.60,'Watch added sugar content.'),
('Drinking Yoghurt','优酪乳','Dairy','fridge',14,'best_before',64.00,1.60,'Shake before drinking.'),
('Butter','牛油 / 黄油','Dairy','fridge',60,'best_before',90.00,1.20,'Freeze for long-term; salted keeps longer.'),
('Cultured Butter','发酵牛油','Dairy','fridge',60,'best_before',110.00,1.20,'Rich flavour; same storage.'),
('Cream','淡奶油','Dairy','fridge',7,'use_by',70.00,1.80,'Whipping needs very cold bowl.'),
('Whipping Cream','打发奶油','Dairy','fridge',7,'use_by',78.00,1.80,'Do not freeze.'),
('Sour Cream','酸忌廉','Dairy','fridge',10,'best_before',72.00,1.70,'Stir from top; keep sealed.'),
('Cream Cheese','忌廉芝士','Dairy','fridge',10,'best_before',85.00,1.70,'Soften at room temp before use.'),
('Cheese Sliced','方包芝士片','Dairy','fridge',21,'best_before',120.00,2.00,'Keep in original wrapper.'),
('Cheddar Block','车打芝士砖','Dairy','fridge',35,'best_before',130.00,2.10,'Wrap in wax paper then foil.'),
('Mozzarella','马苏里拉芝士','Dairy','fridge',14,'best_before',110.00,2.10,'Fresh balls in brine; drain before use.'),
('Parmesan','帕玛森芝士','Dairy','fridge',60,'best_before',180.00,2.20,'Grate as needed; rind for soups.'),
('Feta','菲达芝士','Dairy','fridge',21,'best_before',140.00,2.10,'Keep submerged in brine.'),
('Brie','布里芝士','Dairy','fridge',14,'best_before',150.00,2.20,'Let warm to room temp before serving.'),
('Processed Cheese','再制芝士','Dairy','fridge',45,'best_before',100.00,2.00,'Long shelf; still refrigerate.'),
('Eggs','鲜鸡蛋','Dairy','fridge',21,'best_before',35.00,1.50,'Keep in original carton on middle fridge shelf.'),
('Quail Eggs','鹌鹑蛋','Dairy','fridge',14,'best_before',60.00,1.50,'Smaller; cook quickly.'),
('Condensed Milk','炼奶','Dairy','pantry',365,'best_before',45.00,1.80,'Unopened pantry; opened must chill.'),
('Evaporated Milk','淡奶','Dairy','pantry',365,'best_before',38.00,1.80,'Pantry until opened, then fridge.'),
('Ice Cream','雪糕','Dairy','freezer',60,'best_before',80.00,2.00,'Keep at steady -18C to avoid ice crystals.'),
-- ===================== MEAT & SEAFOOD (fridge / freezer; use_by) =====================
('Chicken Breast','冰鲜鸡胸肉','Meat','fridge',2,'use_by',85.00,3.20,'Strict use-by item: cook thoroughly or freeze immediately.'),
('Chicken Thigh','鸡腿肉','Meat','fridge',2,'use_by',70.00,3.20,'Bone-in keeps slightly longer.'),
('Whole Chicken','冰鲜光鸡','Meat','fridge',2,'use_by',60.00,3.20,'Cook or freeze within 2 days.'),
('Minced Chicken','鸡肉碎','Meat','fridge',1,'use_by',72.00,3.20,'Use same day or freeze.'),
('Pork Chop','猪扒','Meat','fridge',2,'use_by',78.00,3.00,'Pat dry before searing.'),
('Pork Belly','五花肉','Meat','fridge',2,'use_by',60.00,3.00,'Great braised or sliced thin.'),
('Minced Pork','猪肉碎','Meat','fridge',1,'use_by',68.00,3.00,'Use same day or freeze flat.'),
('Pork Ribs','排骨','Meat','fridge',2,'use_by',66.00,3.00,'Blanch before braising.'),
('Beef Steak','牛排','Meat','fridge',3,'use_by',160.00,6.00,'Rest after searing; freeze if not cooking soon.'),
('Ground Beef','牛肉碎','Meat','fridge',1,'use_by',120.00,6.00,'High surface area; use fast.'),
('Beef Brisket','牛腩','Meat','fridge',3,'use_by',90.00,6.00,'Slow braise for tenderness.'),
('Lamb Shoulder','羊肩肉','Meat','fridge',3,'use_by',130.00,6.50,'Marinate for flavour.'),
('Lamb Chop','羊扒','Meat','fridge',3,'use_by',140.00,6.50,'Rest before serving.'),
('Duck Breast','鸭胸','Meat','fridge',2,'use_by',95.00,3.50,'Crisp the skin; render fat.'),
('Sausages Fresh','新鲜香肠','Meat','fridge',2,'use_by',88.00,3.00,'Cook through; never pink inside.'),
('Bacon','烟肉 / 培根','Meat','fridge',5,'use_by',110.00,3.00,'Keep sealed; freeze for longer.'),
('Ham Sliced','火腿片','Meat','fridge',4,'use_by',120.00,2.80,'Keep tightly wrapped.'),
('Fish Fillet','鱼柳','Meat','fridge',1,'use_by',140.00,4.50,'Use-by safety item; keep 0-4C.'),
('Salmon','三文鱼','Meat','fridge',1,'use_by',220.00,4.50,'Sushi grade only raw; else cook.'),
('Mackerel','鲭鱼','Meat','fridge',1,'use_by',90.00,4.20,'Oily; strong flavour, use fast.'),
('Shrimp','虾','Meat','fridge',1,'use_by',160.00,4.00,'Shell-on keeps fresher.'),
('Prawns','大虾','Meat','fridge',1,'use_by',200.00,4.00,'Cook same day or freeze.'),
('Squid','鱿鱼','Meat','fridge',1,'use_by',110.00,3.80,'Clean and score before cooking.'),
('Scallops','带子','Meat','fridge',1,'use_by',240.00,4.00,'Delicate; quick sear.'),
('Clams','蛤蜊','Meat','fridge',1,'use_by',90.00,3.50,'Discard any open uncooked ones.'),
('Mussels','青口','Meat','fridge',1,'use_by',95.00,3.50,'Cook live only.'),
('Crab','蟹','Meat','fridge',1,'use_by',180.00,4.50,'Cook the day of purchase.'),
('Fish Balls','鱼蛋 / 鱼丸','Meat','fridge',3,'use_by',70.00,3.50,'Keep chilled; cook thoroughly.'),
('Fish Cake','鱼饼','Meat','fridge',3,'use_by',72.00,3.50,'Slice into soups and hotpot.'),
-- ===================== BAKERY (pantry / fridge) =====================
('Sourdough Bread','酸种面包 / 吐司','Bakery','pantry',4,'best_before',60.00,0.90,'Slice and freeze if not eaten within 3 days.'),
('White Bread','白面包','Bakery','pantry',4,'best_before',40.00,0.90,'Keep in bread box; avoid fridge (stales).'),
('Whole Wheat Bread','全麦面包','Bakery','pantry',4,'best_before',50.00,0.90,'Denser; same storage.'),
('Baguette','法棍','Bakery','pantry',2,'best_before',45.00,0.90,'Crusty; eat same day or toast.'),
('Croissant','牛角包','Bakery','pantry',2,'best_before',70.00,1.00,'Refresh in oven to crisp.'),
('Burger Bun','汉堡包','Bakery','pantry',3,'best_before',48.00,0.90,'Freeze extras.'),
('Cake','蛋糕','Bakery','fridge',3,'best_before',90.00,1.10,'Cream cakes must chill.'),
('Cheesecake','芝士蛋糕','Bakery','fridge',4,'best_before',120.00,1.20,'Keep cold; rich.'),
('Muffin','玛芬','Bakery','pantry',3,'best_before',55.00,1.00,'Store airtight.'),
('Donut','多拿滋 / 甜甜圈','Bakery','pantry',2,'best_before',50.00,1.00,'Best fresh; glaze melts.'),
('Flatbread','薄饼','Bakery','pantry',4,'best_before',46.00,0.90,'Warm to soften.'),
('Tortilla','墨西哥薄饼','Bakery','pantry',7,'best_before',52.00,0.90,'Seal well; refrigerate in heat.'),
('Pita','皮塔饼','Bakery','pantry',5,'best_before',48.00,0.90,'Toast to puff.'),
('Steamed Bun','蒸包','Bakery','fridge',2,'best_before',44.00,0.90,'Freeze; steam to reheat.'),
('Mooncake','月饼','Bakery','pantry',14,'best_before',120.00,1.20,'Rich; small portions.'),
-- ===================== PANTRY (pantry / fridge) =====================
('Rice','白米','Pantry','pantry',365,'best_before',20.00,2.50,'Airtight container; cool dry.'),
('Glutinous Rice','糯米','Pantry','pantry',365,'best_before',24.00,2.50,'For sticky dishes.'),
('Brown Rice','糙米','Pantry','pantry',180,'best_before',30.00,2.50,'Higher oil; shorter life, fridge best.'),
('Noodles Dried','干面','Pantry','pantry',365,'best_before',22.00,1.50,'Keep dry.'),
('Pasta','意粉','Pantry','pantry',365,'best_before',36.00,1.50,'Store sealed; boils in 8-10 min.'),
('Spaghetti','意大利面','Pantry','pantry',365,'best_before',36.00,1.50,'Same as pasta.'),
('Instant Noodles','公仔面','Pantry','pantry',240,'best_before',18.00,1.50,'Convenience; watch sodium.'),
('Flour','面粉','Pantry','pantry',240,'best_before',16.00,1.20,'Airtight; fridge in heat.'),
('Plain Flour','低筋面粉','Pantry','pantry',240,'best_before',16.00,1.20,'Baking.'),
('Rice Flour','粘米粉','Pantry','pantry',240,'best_before',20.00,1.20,'For steamed cakes.'),
('Sugar','糖','Pantry','pantry',720,'best_before',14.00,1.00,'Dry; clumps in humidity.'),
('Brown Sugar','黄糖','Pantry','pantry',720,'best_before',16.00,1.00,'Softens with bread slice.'),
('Salt','盐','Pantry','pantry',999,'best_before',10.00,0.50,'Indefinite if dry.'),
('Soy Sauce','酱油','Pantry','pantry',540,'best_before',40.00,1.50,'Refrigerate after opening for best flavour.'),
('Oyster Sauce','蚝油','Pantry','fridge',180,'best_before',50.00,1.50,'Keep refrigerated once opened.'),
('Hoisin Sauce','海鲜酱','Pantry','fridge',180,'best_before',48.00,1.50,'Refrigerate after opening.'),
('Tomato Ketchup','番茄酱','Pantry','fridge',180,'best_before',38.00,1.30,'Fridge after opening.'),
('Chili Sauce','辣椒酱','Pantry','fridge',365,'best_before',55.00,1.30,'Long life; keep sealed.'),
('Olive Oil','橄榄油','Pantry','pantry',540,'best_before',140.00,3.00,'Cool dark; not near stove.'),
('Vegetable Oil','食油','Pantry','pantry',540,'best_before',36.00,2.50,'Store cool dark.'),
('Sesame Oil','麻油','Pantry','pantry',365,'best_before',80.00,2.80,'A little goes far; fridge optional.'),
('Vinegar','醋','Pantry','pantry',720,'best_before',30.00,1.00,'Acidic; near indefinite.'),
('Rice Vinegar','米醋','Pantry','pantry',720,'best_before',32.00,1.00,'For dressing and pickles.'),
('Canned Tuna','罐装吞拿鱼','Pantry','pantry',1095,'best_before',60.00,1.80,'Pantry until opened; then fridge 2 days.'),
('Canned Sardine','罐头沙丁鱼','Pantry','pantry',1095,'best_before',45.00,1.80,'Long shelf.'),
('Canned Corn','罐头粟米','Pantry','pantry',1095,'best_before',28.00,1.20,'Rinse before use.'),
('Canned Tomato','罐头番茄','Pantry','pantry',1095,'best_before',30.00,1.20,'Base for sauces.'),
('Canned Beans','罐头豆','Pantry','pantry',1095,'best_before',34.00,1.20,'Rinse to cut salt.'),
('Peanut Butter','花生酱','Pantry','pantry',365,'best_before',90.00,1.60,'Stir; fridge optional.'),
('Jam','果酱','Pantry','fridge',365,'best_before',70.00,1.30,'Refrigerate after opening.'),
('Honey','蜜糖','Pantry','pantry',999,'best_before',120.00,1.20,'Crystallizes; warms clear.'),
('Dried Pasta','干意粉','Pantry','pantry',365,'best_before',36.00,1.50,'Store sealed.'),
('Lentils','扁豆 /  lentils','Pantry','pantry',365,'best_before',40.00,0.90,'Soak before cooking.'),
('Red Beans','红豆','Pantry','pantry',365,'best_before',36.00,0.90,'For sweet soup.'),
('Mung Beans','绿豆','Pantry','pantry',365,'best_before',34.00,0.90,'For moong curry.'),
('Black Beans','黑豆','Pantry','pantry',365,'best_before',38.00,0.90,'Soak well.'),
('Chickpeas','鹰嘴豆','Pantry','pantry',365,'best_before',42.00,0.90,'For hummus.'),
('Tofu Firm','板豆腐 / 硬豆腐','Produce','fridge',4,'use_by',22.00,0.90,'Consume by use-by date; submerge in fresh cold water after opening.'),
('Tofu Silken','嫩豆腐','Produce','fridge',4,'use_by',24.00,0.90,'Handle gently; use in soups.'),
('Egg Tofu','鸡蛋豆腐','Produce','fridge',4,'use_by',26.00,0.90,'Steam or braise.'),
('Firm Tofu','板豆腐','Produce','fridge',4,'use_by',22.00,0.90,'Consume by use-by date.'),
('Tempeh','丹贝','Produce','fridge',5,'best_before',60.00,1.00,'Fermented; keep cool.'),
('Natto','纳豆','Produce','fridge',7,'best_before',70.00,1.00,'Strong; stir to activate strings.'),
('Miso','味噌','Pantry','fridge',365,'best_before',90.00,1.50,'Refrigerate; do not boil.'),
('Seaweed Nori','紫菜','Pantry','pantry',365,'best_before',120.00,1.00,'Keep bone dry.'),
('Dried Shiitake','干冬菇','Pantry','pantry',720,'best_before',160.00,0.70,'Soak before use.'),
('Vermicelli','粉丝','Pantry','pantry',365,'best_before',24.00,1.20,'Soak in warm water.'),
('Glass Noodles','粉丝 / 冬粉','Pantry','pantry',365,'best_before',26.00,1.20,'For hotpot.'),
('Couscous','古斯米','Pantry','pantry',365,'best_before',50.00,1.30,'Pour boiling water, fluff.'),
('Quinoa','藜麦','Pantry','pantry',365,'best_before',90.00,1.40,'Rinse to remove saponin.'),
('Oats','燕麦','Pantry','pantry',365,'best_before',40.00,1.20,'For porridge and baking.'),
('Breakfast Cereal','早餐麦片','Pantry','pantry',270,'best_before',55.00,1.20,'Seal against humidity.'),
('Crackers','饼干 / 梳打饼','Pantry','pantry',180,'best_before',45.00,1.30,'Airtight or they soften.'),
('Biscuits','饼干','Pantry','pantry',180,'best_before',50.00,1.30,'Keep sealed.'),
('Chocolate','巧克力','Pantry','pantry',365,'best_before',110.00,2.00,'Cool dry; bloom if warm.'),
('Peanuts','花生','Pantry','pantry',270,'best_before',60.00,1.00,'Roast; fridge in heat.'),
('Walnuts','合桃 / 核桃','Pantry','fridge',270,'best_before',160.00,1.10,'Fridge to stop rancid.'),
('Almonds','杏仁','Pantry','fridge',270,'best_before',150.00,1.10,'Keep cool.'),
('Cashews','腰果','Pantry','fridge',270,'best_before',155.00,1.10,'Seal well.'),
('Sesame Seeds','芝麻','Pantry','pantry',365,'best_before',80.00,1.00,'Toast to release aroma.'),
('Coconut Milk','椰浆','Pantry','pantry',540,'best_before',45.00,2.00,'Fridge after opening.'),
('Curry Paste','咖喱酱','Pantry','fridge',365,'best_before',70.00,1.50,'Refrigerate after opening.'),
('Stock Cube','汤块 / 鸡汤粒','Pantry','pantry',720,'best_before',60.00,1.20,'Dissolve in hot water.'),
('Tea Leaves','茶叶','Pantry','pantry',540,'best_before',120.00,1.00,'Airtight, away from odour.'),
('Coffee Beans','咖啡豆','Pantry','pantry',270,'best_before',180.00,2.00,'Grind fresh; store airtight.'),
('Instant Coffee','即溶咖啡','Pantry','pantry',540,'best_before',130.00,1.80,'Dry scoop.'),
('Bottled Water','樽装水','Pantry','pantry',999,'best_before',12.00,0.20,'Indefinite sealed.');

-- ===================== seed_recipes_expanded.sql =====================
-- FreshTrack HK — Expanded Rescue Recipes Seed (30+)
-- Additive. Run AFTER seed_storage_rules.sql / seed_storage_rules_expanded.sql.
-- Ingredient names should match storage_rules.keyword_en so match-recipes can link them.
-- ingredients JSONB: [{"name","weight_g"}]; steps JSONB: ["..."]; tags TEXT[].

INSERT INTO recipes (title, prep_time_min, difficulty, servings, ingredients, steps, tags) VALUES
('Spinach & Chicken Power Bowl', 20, 'Easy', 2,
 '[{"name":"Baby Spinach","weight_g":200},{"name":"Chicken Breast","weight_g":300},{"name":"Cherry Tomatoes","weight_g":100}]'::jsonb,
 '["Season chicken breast with salt, pepper, olive oil; pan-sear 5-6 min per side to 75C.", "Wash and spin-dry baby spinach; halve cherry tomatoes.", "Slice chicken over spinach, drizzle with dressing."]'::jsonb,
 ARRAY['High-Protein','Rescue-Top']),
('Tomato-Yoghurt Dip', 10, 'Easy', 4,
 '[{"name":"Greek Yoghurt","weight_g":250},{"name":"Cherry Tomatoes","weight_g":150}]'::jsonb,
 '["Blister cherry tomatoes in skillet with olive oil and garlic, 4 min.", "Whisk cold Greek yoghurt with salt and lemon zest.", "Spoon warm tomatoes over yoghurt; serve with toast."]'::jsonb,
 ARRAY['Quick-Snack','Vegetarian']),
('Sourdough Bread Pudding', 25, 'Easy', 3,
 '[{"name":"Sourdough Bread","weight_g":250},{"name":"Whole Milk","weight_g":200},{"name":"Eggs","weight_g":150}]'::jsonb,
 '["Cube stale sourdough; mash ripe bananas.", "Whisk milk, eggs, cinnamon; soak cubes 10 min.", "Bake 180C 18-20 min until set."]'::jsonb,
 ARRAY['Bakery-Rescue','Dessert']),
('Stir-fried Gai Lan with Garlic', 10, 'Easy', 2,
 '[{"name":"Gai Lan","weight_g":300},{"name":"Garlic","weight_g":20}]'::jsonb,
 '["Blanch gai lan 60 seconds; drain.", "Fry minced garlic in oil; return gai lan, toss with oyster sauce.", "Plate hot."]'::jsonb,
 ARRAY['Vegetable','Quick']),
('Choy Sum with Beef', 15, 'Easy', 2,
 '[{"name":"Choy Sum","weight_g":300},{"name":"Beef Steak","weight_g":200}]'::jsonb,
 '["Slice beef thinly; marinate with soy and cornflour.", "Sear beef hot; remove. Stir-fry choy sum; return beef.", "Season and serve."]'::jsonb,
 ARRAY['High-Protein']),
('Scrambled Eggs & Tomato', 10, 'Easy', 2,
 '[{"name":"Eggs","weight_g":200},{"name":"Tomato","weight_g":200}]'::jsonb,
 '["Dice tomato; cook down to a sauce.", "Beat eggs; pour in, scramble gently.", "Season with salt."]'::jsonb,
 ARRAY['Breakfast','Quick']),
('Chicken Congee', 40, 'Easy', 3,
 '[{"name":"Chicken Breast","weight_g":250},{"name":"Rice","weight_g":120}]'::jsonb,
 '["Simmer rice in plenty of water until broken down.", "Shred poached chicken in; season with ginger and salt.", "Top with spring onion."]'::jsonb,
 ARRAY['Comfort','One-Pot']),
('Pork Belly Braise', 60, 'Medium', 4,
 '[{"name":"Pork Belly","weight_g":500},{"name":"Garlic","weight_g":20},{"name":"Ginger","weight_g":20}]'::jsonb,
 '["Blanch pork belly; cube.", "Caramelise sugar, add pork, soy, water; braise 45 min.", "Reduce sauce; serve with rice."]'::jsonb,
 ARRAY['Rice-Pair','Rich']),
('Salmon Pan-Seared', 15, 'Easy', 2,
 '[{"name":"Salmon","weight_g":300},{"name":"Lemon","weight_g":50}]'::jsonb,
 '["Pat salmon dry; sear skin-side 4 min.", "Flip 2 min; finish with lemon butter.", "Rest before serving."]'::jsonb,
 ARRAY['High-Protein','Low-Carb']),
('Shrimp Garlic Vermicelli', 20, 'Easy', 2,
 '[{"name":"Shrimp","weight_g":250},{"name":"Vermicelli","weight_g":100},{"name":"Garlic","weight_g":30}]'::jsonb,
 '["Soak vermicelli; lay in dish.", "Top with shrimp and garlic-oil; steam 8 min.", "Soy and scallion to finish."]'::jsonb,
 ARRAY['Seafood']),
('Vegetable Fried Rice', 15, 'Easy', 2,
 '[{"name":"Rice","weight_g":300},{"name":"Carrot","weight_g":100},{"name":"Spring Onion","weight_g":30},{"name":"Eggs","weight_g":100}]'::jsonb,
 '["Beat and scramble eggs; set aside.", "Stir-fry diced carrot, add rice, soy, eggs.", "Finish with spring onion."]'::jsonb,
 ARRAY['Leftover Rescue','Vegetarian']),
('Mushroom Cream Pasta', 20, 'Easy', 2,
 '[{"name":"Pasta","weight_g":200},{"name":"Button Mushroom","weight_g":200},{"name":"Cream","weight_g":100}]'::jsonb,
 '["Boil pasta al dente.", "Saute mushrooms; add cream and simmer.", "Toss pasta; parmesan on top."]'::jsonb,
 ARRAY['Vegetarian','Comfort']),
('Tofu Mapo', 20, 'Medium', 2,
 '[{"name":"Firm Tofu","weight_g":300},{"name":"Minced Pork","weight_g":150},{"name":"Garlic","weight_g":15}]'::jsonb,
 '["Cube tofu; gently simmer in stock.", "Fry minced pork with bean paste and garlic.", "Combine, thicken, serve with rice."]'::jsonb,
 ARRAY['Spicy','Rice-Pair']),
('Greek Salad', 10, 'Easy', 2,
 '[{"name":"Cucumber","weight_g":150},{"name":"Cherry Tomatoes","weight_g":150},{"name":"Feta","weight_g":100}]'::jsonb,
 '["Chop cucumber and halve tomatoes.", "Toss with olives, feta, olive oil, oregano.", "Serve chilled."]'::jsonb,
 ARRAY['Vegetarian','Fresh']),
('Banana Smoothie', 5, 'Easy', 1,
 '[{"name":"Banana","weight_g":120},{"name":"Whole Milk","weight_g":200}]'::jsonb,
 '["Freeze peeled banana.", "Blend with milk until smooth.", "Serve cold."]'::jsonb,
 ARRAY['Drink','Quick']),
('Roast Chicken Thighs', 35, 'Easy', 3,
 '[{"name":"Chicken Thigh","weight_g":600},{"name":"Lemon","weight_g":50},{"name":"Garlic","weight_g":20}]'::jsonb,
 '["Marinate thighs with lemon, garlic, oil.", "Roast 200C 30 min until 75C inside.", "Rest and slice."]'::jsonb,
 ARRAY['High-Protein']),
('Egg Fried Noodles', 15, 'Easy', 2,
 '[{"name":"Dried Noodles","weight_g":200},{"name":"Eggs","weight_g":100},{"name":"Spring Onion","weight_g":30}]'::jsonb,
 '["Boil noodles; drain.", "Scramble eggs; add noodles, soy, scallion.", "Toss over high heat."]'::jsonb,
 ARRAY['Quick','Vegetarian-OK']),
('Beef Brisket Stew', 90, 'Medium', 4,
 '[{"name":"Beef Brisket","weight_g":600},{"name":"Carrot","weight_g":200},{"name":"Potato","weight_g":200}]'::jsonb,
 '["Blanch brisket; brown.", "Simmer with aromatics 60 min.", "Add carrot and potato; cook 30 min more."]'::jsonb,
 ARRAY['One-Pot','Rich']),
('Cucumber Yoghurt Salad', 8, 'Easy', 2,
 '[{"name":"Cucumber","weight_g":200},{"name":"Greek Yoghurt","weight_g":150}]'::jsonb,
 '["Dice cucumber; salt 5 min, drain.", "Fold into yoghurt with mint and lemon.", "Serve cool."]'::jsonb,
 ARRAY['Vegetarian','Side']),
('Clams in Garlic Wine', 15, 'Easy', 2,
 '[{"name":"Clams","weight_g":400},{"name":"Garlic","weight_g":20}]'::jsonb,
 '["Rinse clams; discard open ones.", "Fry garlic; add clams and a splash of liquid; cover 5 min.", "Garnish with coriander."]'::jsonb,
 ARRAY['Seafood']),
('Pumpkin Soup', 30, 'Easy', 4,
 '[{"name":"Pumpkin","weight_g":500},{"name":"Whole Milk","weight_g":200},{"name":"Onion","weight_g":100}]'::jsonb,
 '["Saute onion; add cubed pumpkin and stock.", "Simmer 20 min; blend smooth.", "Stir in milk; season."]'::jsonb,
 ARRAY['Vegetarian','Comfort']),
('Fish Fillet Pan-Fry', 15, 'Easy', 2,
 '[{"name":"Fish Fillet","weight_g":300},{"name":"Lemon","weight_g":40}]'::jsonb,
 '["Pat fillet dry; season.", "Pan-fry 3 min per side until opaque.", "Finish with lemon."]'::jsonb,
 ARRAY['High-Protein','Low-Carb']),
('Lentil Curry', 35, 'Easy', 3,
 '[{"name":"Lentils","weight_g":250},{"name":"Onion","weight_g":100},{"name":"Tomato","weight_g":150}]'::jsonb,
 '["Fry onion; add spices and tomato.", "Add lentils and water; simmer 25 min.", "Serve with rice."]'::jsonb,
 ARRAY['Vegan','High-Fiber']),
('Cheese Omelette', 8, 'Easy', 1,
 '[{"name":"Eggs","weight_g":150},{"name":"Cheddar Block","weight_g":60}]'::jsonb,
 '["Beat eggs; heat buttered pan.", "Pour in, top with grated cheese; fold.", "Slide onto plate."]'::jsonb,
 ARRAY['Breakfast','Quick']),
('Lettuce Chicken Wrap', 15, 'Easy', 2,
 '[{"name":"Lettuce","weight_g":150},{"name":"Chicken Breast","weight_g":250}]'::jsonb,
 '["Cook and shred chicken; mix with dressing.", "Spoon into crisp lettuce cups.", "Top with peanuts."]'::jsonb,
 ARRAY['Low-Carb','High-Protein']),
('Bacon Carbonara', 20, 'Easy', 2,
 '[{"name":"Spaghetti","weight_g":200},{"name":"Bacon","weight_g":120},{"name":"Eggs","weight_g":100},{"name":"Cheddar Block","weight_g":50}]'::jsonb,
 '["Boil spaghetti.", "Crisp bacon; whisk eggs with cheese.", "Off heat, toss pasta with egg mix and bacon."]'::jsonb,
 ARRAY['Comfort']),
('Steamed Egg Tofu', 12, 'Easy', 2,
 '[{"name":"Egg Tofu","weight_g":300},{"name":"Eggs","weight_g":100},{"name":"Spring Onion","weight_g":20}]'::jsonb,
 '["Slice tofu into dish.", "Pour over seasoned egg; steam 8 min.", "Soy and scallion on top."]'::jsonb,
 ARRAY['Soft','Quick']),
('Carrot Ginger Soup', 25, 'Easy', 3,
 '[{"name":"Carrot","weight_g":300},{"name":"Ginger","weight_g":20},{"name":"Onion","weight_g":80}]'::jsonb,
 '["Saute onion and ginger; add carrot.", "Cover with stock; simmer 20 min; blend.", "Season light."]'::jsonb,
 ARRAY['Vegan','Warm']),
('Mango Sticky Rice', 30, 'Medium', 3,
 '[{"name":"Mango","weight_g":300},{"name":"Rice","weight_g":150},{"name":"Coconut Milk","weight_g":200}]'::jsonb,
 '["Cook sticky rice; steep in coconut milk + sugar.", "Slice mango.", "Serve rice with mango and drizzle."]'::jsonb,
 ARRAY['Dessert','Sweet']),
('Potato Beef Hash', 20, 'Easy', 2,
 '[{"name":"Potato","weight_g":250},{"name":"Ground Beef","weight_g":200},{"name":"Onion","weight_g":80}]'::jsonb,
 '["Dice and pan-fry potato until golden.", "Add onion and beef; cook through.", "Crisp and season."]'::jsonb,
 ARRAY['One-Pan']),
('Avocado Egg Toast', 8, 'Easy', 1,
 '[{"name":"Sourdough Bread","weight_g":80},{"name":"Avocado","weight_g":120},{"name":"Eggs","weight_g":100}]'::jsonb,
 '["Toast bread; mash avocado on top.", "Fry or poach egg; place on avocado.", "Salt and chili flakes."]'::jsonb,
 ARRAY['Breakfast','Vegetarian']),
('Cabbage Stir-fry', 10, 'Easy', 2,
 '[{"name":"Cabbage","weight_g":300},{"name":"Garlic","weight_g":15}]'::jsonb,
 '["Shred cabbage.", "Fry garlic; add cabbage, high heat, toss with soy.", "Keep crunchy."]'::jsonb,
 ARRAY['Vegan','Quick']),
('Miso Soup', 10, 'Easy', 2,
 '[{"name":"Miso","weight_g":40},{"name":"Firm Tofu","weight_g":100},{"name":"Spring Onion","weight_g":20}]'::jsonb,
 '["Warm dashi/water (do not boil).", "Dissolve miso; add cubed tofu.", "Scallion to finish."]'::jsonb,
 ARRAY['Light','Vegan']);

