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
