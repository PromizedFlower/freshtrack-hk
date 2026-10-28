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
