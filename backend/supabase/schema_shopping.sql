-- FreshTrack HK — P3-2 Smart Shopping List (Incremental Migration)
-- A household shopping list that auto-suggests replenishment when stock is consumed or discarded.

CREATE TABLE IF NOT EXISTS shopping_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    category TEXT,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'pcs',
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_suggested BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'bought', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_household ON shopping_list (household_id, status);

-- Auto-suggest: when an item is consumed or discarded, add it to the list (frontend confirms/ignores).
CREATE OR REPLACE FUNCTION auto_suggest_shopping_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IN ('consumed', 'discarded') AND OLD.status = 'in_stock' THEN
        INSERT INTO shopping_list (household_id, item_name, category, quantity, unit, added_by, is_suggested)
        VALUES (NEW.household_id, NEW.name, NEW.category, NEW.quantity, NEW.unit, NULL, TRUE);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shopping_auto_suggest ON fridge_items;
CREATE TRIGGER trg_shopping_auto_suggest
    AFTER UPDATE ON fridge_items
    FOR EACH ROW EXECUTE FUNCTION auto_suggest_shopping_item();

DROP TRIGGER IF EXISTS trg_shopping_list_updated_at ON shopping_list;
CREATE TRIGGER trg_shopping_list_updated_at
    BEFORE UPDATE ON shopping_list
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Household members manage their own list.
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shopping_list_select ON shopping_list;
CREATE POLICY shopping_list_select ON shopping_list
    FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS shopping_list_insert ON shopping_list;
CREATE POLICY shopping_list_insert ON shopping_list
    FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS shopping_list_update ON shopping_list;
CREATE POLICY shopping_list_update ON shopping_list
    FOR UPDATE USING (is_household_member(household_id)) WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS shopping_list_delete ON shopping_list;
CREATE POLICY shopping_list_delete ON shopping_list
    FOR DELETE USING (is_household_member(household_id));
