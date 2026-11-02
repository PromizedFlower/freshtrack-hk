-- FreshTrack HK — Demo Seed (run AFTER 00-run-all.sql)
-- Seeds THREE independent households (2-person / 2-person / 1-person), each with its own
-- near-expiry stock and a few months of SDG 12.3 impact history, so every account sees
-- different family data (exercises the multi-household model).
-- 5 demo accounts (demo1..demo5@freshtrack.hk / FreshTrackDemo123!) are created via
-- Admin API (see backend/deploy/seed_demo_users.sql) BEFORE this seed.

-- These tables are FORCE ROW LEVEL SECURITY; temporarily disable so the seed can write as owner.
ALTER TABLE households DISABLE ROW LEVEL SECURITY;
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE fridge_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE waste_impact_logs DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Households: 陳家 (2) / 李家 (2) / 周家 (1)
-- ---------------------------------------------------------------------------
INSERT INTO households (id, name, owner_id, invite_code, monthly_budget_hkd) VALUES
('11111111-1111-4111-8111-111111111111', '陳家', (SELECT id FROM auth.users WHERE email = 'demo1@freshtrack.hk'), 'CHEN01', 3500.00),
('22222222-2222-4222-8222-222222222222', '李家', (SELECT id FROM auth.users WHERE email = 'demo3@freshtrack.hk'), 'LEE01',  3000.00),
('33333333-3333-4333-8333-333333333333', '周家', (SELECT id FROM auth.users WHERE email = 'demo5@freshtrack.hk'), 'CHOW01', 2000.00)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 陳家 stock (2 people) — spread of high / medium / low risk
-- ---------------------------------------------------------------------------
INSERT INTO fridge_items (household_id, name, category, quantity, unit, weight_grams, price_hkd, expiry_date, date_type, is_date_estimated, storage_zone, source_method) VALUES
('11111111-1111-4111-8111-111111111111', 'Baby Spinach', 'Produce', 1, 'pcs', 200, 13.00, CURRENT_DATE + 1, 'best_before', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Firm Tofu', 'Produce', 1, 'block', 300, 6.60, CURRENT_DATE + 1, 'use_by', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Chicken Breast', 'Meat', 2, 'pcs', 600, 51.00, CURRENT_DATE + 2, 'use_by', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Whole Milk', 'Dairy', 1, 'L', 1000, 28.00, CURRENT_DATE + 2, 'use_by', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Sourdough Bread', 'Bakery', 1, 'loaf', 400, 24.00, CURRENT_DATE + 2, 'best_before', false, 'pantry', 'manual'),
('11111111-1111-4111-8111-111111111111', 'Cherry Tomatoes', 'Produce', 1, 'box', 250, 10.50, CURRENT_DATE + 3, 'best_before', false, 'fridge', 'photo'),
('11111111-1111-4111-8111-111111111111', 'Eggs', 'Dairy', 12, 'pcs', 600, 21.00, CURRENT_DATE + 14, 'best_before', false, 'fridge', 'manual'),
('11111111-1111-4111-8111-111111111111', 'Carrot', 'Produce', 3, 'pcs', 300, 4.80, CURRENT_DATE + 20, 'best_before', false, 'fridge', 'manual');

-- ---------------------------------------------------------------------------
-- 李家 stock (2 people)
-- ---------------------------------------------------------------------------
INSERT INTO fridge_items (household_id, name, category, quantity, unit, weight_grams, price_hkd, expiry_date, date_type, is_date_estimated, storage_zone, source_method) VALUES
('22222222-2222-4222-8222-222222222222', 'Firm Tofu', 'Produce', 1, 'block', 300, 6.60, CURRENT_DATE + 1, 'use_by', false, 'fridge', 'receipt'),
('22222222-2222-4222-8222-222222222222', 'Salmon Fillet', 'Meat', 1, 'pcs', 300, 42.00, CURRENT_DATE + 2, 'use_by', false, 'freezer', 'receipt'),
('22222222-2222-4222-8222-222222222222', 'Cherry Tomatoes', 'Produce', 1, 'box', 250, 10.50, CURRENT_DATE + 3, 'best_before', false, 'fridge', 'photo'),
('22222222-2222-4222-8222-222222222222', 'Soy Milk', 'Dairy', 1, 'L', 1000, 16.00, CURRENT_DATE + 5, 'use_by', false, 'fridge', 'manual'),
('22222222-2222-4222-8222-222222222222', 'Gai Lan', 'Produce', 1, 'bunch', 300, 7.50, CURRENT_DATE + 1, 'best_before', false, 'fridge', 'manual');

-- ---------------------------------------------------------------------------
-- 周家 stock (1 person)
-- ---------------------------------------------------------------------------
INSERT INTO fridge_items (household_id, name, category, quantity, unit, weight_grams, price_hkd, expiry_date, date_type, is_date_estimated, storage_zone, source_method) VALUES
('33333333-3333-4333-8333-333333333333', 'Chicken Breast', 'Meat', 1, 'pcs', 250, 24.00, CURRENT_DATE + 2, 'use_by', false, 'fridge', 'receipt'),
('33333333-3333-4333-8333-333333333333', 'Broccoli', 'Produce', 1, 'head', 300, 9.00, CURRENT_DATE + 1, 'best_before', false, 'fridge', 'photo'),
('33333333-3333-4333-8333-333333333333', 'Instant Noodles', 'Pantry', 2, 'pcs', 200, 12.00, CURRENT_DATE + 180, 'best_before', false, 'pantry', 'manual');

-- ---------------------------------------------------------------------------
-- Impact history (feeds Dashboard KPI + Impact trend per household)
-- ---------------------------------------------------------------------------
INSERT INTO waste_impact_logs (household_id, item_id, recipe_id, action_type, weight_grams, money_saved_hkd, co2e_avoided_kg, logged_at) VALUES
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'rescued_by_recipe', 400, 22.00, 1.280, NOW() - INTERVAL '2 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'consumed_direct', 250, 12.00, 0.450, NOW() - INTERVAL '12 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'rescued_by_recipe', 600, 45.00, 2.400, NOW() - INTERVAL '40 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'consumed_direct', 180, 8.00, 0.300, NOW() - INTERVAL '70 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'rescued_by_recipe', 500, 38.00, 1.900, NOW() - INTERVAL '100 days'),
('22222222-2222-4222-8222-222222222222', NULL, NULL, 'consumed_direct', 300, 15.00, 0.600, NOW() - INTERVAL '6 days'),
('22222222-2222-4222-8222-222222222222', NULL, NULL, 'rescued_by_recipe', 250, 18.00, 0.800, NOW() - INTERVAL '35 days'),
('33333333-3333-4333-8333-333333333333', NULL, NULL, 'consumed_direct', 200, 9.00, 0.350, NOW() - INTERVAL '20 days');

-- Restore RLS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fridge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_impact_logs ENABLE ROW LEVEL SECURITY;
