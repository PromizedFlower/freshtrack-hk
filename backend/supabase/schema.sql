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
    source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'ai')),
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
