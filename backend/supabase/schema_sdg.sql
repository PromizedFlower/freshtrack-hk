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
