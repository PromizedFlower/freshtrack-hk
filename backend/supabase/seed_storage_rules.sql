-- Seed Data for FreshTrack HK Storage Rules & Sample Rescue Recipes
INSERT INTO storage_rules (keyword_en, keyword_zh, category, default_zone, shelf_life_days, default_date_type, avg_price_hkd_per_kg, co2e_kg_per_kg, storage_tip) VALUES
('Baby Spinach', '嫩菠菜 / 沙拉菠菜', 'Produce', 'fridge', 4, 'best_before', 65.00, 1.100, 'Keep dry with a paper towel in crisper drawer'),
('Chicken Breast', '冰鲜鸡胸肉', 'Meat', 'fridge', 2, 'use_by', 85.00, 3.200, 'Strict use-by item: cook thoroughly or freeze immediately'),
('Whole Milk', '鲜牛奶 (巴氏杀菌)', 'Dairy', 'fridge', 5, 'use_by', 28.00, 1.900, 'Store on middle shelf, avoid fridge door temperature swings'),
('Greek Yoghurt', '希腊酸奶', 'Dairy', 'fridge', 10, 'best_before', 76.00, 1.600, 'Keep tightly sealed in refrigerator at 0-4°C'),
('Cherry Tomatoes', '圣女果 / 樱桃番茄', 'Produce', 'fridge', 7, 'best_before', 42.00, 0.950, 'Wash only right before eating to prevent mold'),
('Bananas', '香蕉', 'Produce', 'pantry', 4, 'best_before', 18.00, 0.800, 'Freeze peeled overripe bananas for smoothies or baking'),
('Sourdough Bread', '酸种面包 / 吐司', 'Bakery', 'pantry', 4, 'best_before', 60.00, 0.900, 'Slice and freeze if not eaten within 3 days'),
('Eggs', '鲜鸡蛋', 'Dairy', 'fridge', 21, 'best_before', 35.00, 1.500, 'Keep in original carton on middle fridge shelf'),
('Firm Tofu', '板豆腐 / 硬豆腐', 'Produce', 'fridge', 4, 'use_by', 22.00, 0.900, 'Consume by use-by date; submerge in fresh cold water after opening');

INSERT INTO recipes (title, prep_time_min, difficulty, servings, ingredients, steps, tags) VALUES
('Spinach & Chicken Power Bowl', 20, 'Easy', 2,
 '[{"name": "Baby Spinach", "weight_g": 200}, {"name": "Chicken Breast", "weight_g": 300}, {"name": "Cherry Tomatoes", "weight_g": 100}]'::jsonb,
 '["Season chicken breast with salt, pepper, and olive oil; pan-sear for 5-6 mins per side until internal temp reaches 75°C.", "Wash and spin-dry baby spinach and halve the cherry tomatoes.", "Slice cooked chicken over the spinach bed and drizzle with dressing."]'::jsonb,
 ARRAY['High-Protein', 'Rescue-Top']),
('Tomato-Yoghurt Dip', 10, 'Easy', 4,
 '[{"name": "Greek Yoghurt", "weight_g": 250}, {"name": "Cherry Tomatoes", "weight_g": 150}]'::jsonb,
 '["Blister cherry tomatoes in a hot skillet with olive oil and garlic for 4 minutes.", "Whisk cold Greek yoghurt with a pinch of salt and lemon zest.", "Spoon warm blistered tomatoes over the yoghurt and serve with toasted bread."]'::jsonb,
 ARRAY['Quick-Snack', 'Vegetarian']),
('Sourdough Bread Pudding', 25, 'Easy', 3,
 '[{"name": "Sourdough Bread", "weight_g": 250}, {"name": "Whole Milk", "weight_g": 200}, {"name": "Bananas", "weight_g": 120}]'::jsonb,
 '["Cube stale sourdough bread and mash ripe bananas.", "Whisk whole milk, eggs, and cinnamon, then soak bread cubes for 10 minutes.", "Bake at 180°C for 18-20 minutes until golden and set."]'::jsonb,
 ARRAY['Bakery-Rescue', 'Dessert']);
