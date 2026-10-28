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
