-- FreshTrack HK — Demo Seed (run AFTER 00-run-all.sql, in SQL Editor)
-- Seeds the "Demo Family Fridge" household with realistic near-expiry stock and a few
-- months of SDG 12.3 impact history, so every screen is populated on first open.
-- Demo user (demo@freshtrack.hk / FreshTrackDemo123!) is created separately — see SECRETS.md.

-- These tables are FORCE ROW LEVEL SECURITY; temporarily disable so the seed can write as owner.
ALTER TABLE households DISABLE ROW LEVEL SECURITY;
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE fridge_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE waste_impact_logs DISABLE ROW LEVEL SECURITY;

INSERT INTO households (id, name, owner_id, invite_code, monthly_budget_hkd) VALUES
('11111111-1111-4111-8111-111111111111', 'Demo Family Fridge', 'e2cbec58-8b62-4c24-9dd7-2b0f3085e13f', 'DEMO01', 3500.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_members (household_id, user_id, role) VALUES
('11111111-1111-4111-8111-111111111111', 'e2cbec58-8b62-4c24-9dd7-2b0f3085e13f', 'owner')
ON CONFLICT (household_id, user_id) DO NOTHING;

-- Demo stock: a spread of high / medium / low risk relative to today.
INSERT INTO fridge_items (household_id, name, category, quantity, unit, weight_grams, price_hkd, expiry_date, date_type, is_date_estimated, storage_zone, source_method) VALUES
('11111111-1111-4111-8111-111111111111', 'Baby Spinach', 'Produce', 1, 'pcs', 200, 13.00, CURRENT_DATE + 1, 'best_before', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Firm Tofu', 'Produce', 1, 'block', 300, 6.60, CURRENT_DATE + 1, 'use_by', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Chicken Breast', 'Meat', 2, 'pcs', 600, 51.00, CURRENT_DATE + 2, 'use_by', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Whole Milk', 'Dairy', 1, 'L', 1000, 28.00, CURRENT_DATE + 2, 'use_by', false, 'fridge', 'receipt'),
('11111111-1111-4111-8111-111111111111', 'Sourdough Bread', 'Bakery', 1, 'loaf', 400, 24.00, CURRENT_DATE + 2, 'best_before', false, 'pantry', 'manual'),
('11111111-1111-4111-8111-111111111111', 'Cherry Tomatoes', 'Produce', 1, 'box', 250, 10.50, CURRENT_DATE + 3, 'best_before', false, 'fridge', 'photo'),
('11111111-1111-4111-8111-111111111111', 'Eggs', 'Dairy', 12, 'pcs', 600, 21.00, CURRENT_DATE + 14, 'best_before', false, 'fridge', 'manual'),
('11111111-1111-4111-8111-111111111111', 'Carrot', 'Produce', 3, 'pcs', 300, 4.80, CURRENT_DATE + 20, 'best_before', false, 'fridge', 'manual');

-- A few months of impact history (feeds Dashboard KPI + Impact trend chart).
INSERT INTO waste_impact_logs (household_id, item_id, recipe_id, action_type, weight_grams, money_saved_hkd, co2e_avoided_kg, logged_at) VALUES
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'rescued_by_recipe', 400, 22.00, 1.280, NOW() - INTERVAL '2 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'consumed_direct', 250, 12.00, 0.450, NOW() - INTERVAL '12 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'rescued_by_recipe', 600, 45.00, 2.400, NOW() - INTERVAL '40 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'consumed_direct', 180, 8.00, 0.300, NOW() - INTERVAL '70 days'),
('11111111-1111-4111-8111-111111111111', NULL, NULL, 'rescued_by_recipe', 500, 38.00, 1.900, NOW() - INTERVAL '100 days');

-- Restore RLS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fridge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_impact_logs ENABLE ROW LEVEL SECURITY;
