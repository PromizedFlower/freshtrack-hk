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
-- NOTE: PostgreSQL does not support CREATE TYPE IF NOT EXISTS — use a DO block instead.
DO $$ BEGIN
    CREATE TYPE household_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 8. get_me(): current authenticated user's profile + primary household + role.
--    Used by the "Me" tab profile card (avatar / name / email / household / role / invite code).
CREATE OR REPLACE FUNCTION get_me()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'display_name', COALESCE(p.display_name, 'FreshTrack User'),
        'avatar_url', p.avatar_url,
        'locale', p.locale,
        'household_id', hm.household_id,
        'household_name', h.name,
        'invite_code', h.invite_code,
        'role', hm.role::text
    )
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    LEFT JOIN household_members hm ON hm.user_id = u.id
    LEFT JOIN households h ON h.id = hm.household_id
    WHERE u.id = auth.uid()
    ORDER BY hm.joined_at ASC NULLS LAST
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_me() TO authenticated;

-- 9. get_household_members(): list a household's members (name / avatar / role) for the family view.
--    Caller must be a member of that household (enforced even under SECURITY DEFINER).
CREATE OR REPLACE FUNCTION get_household_members(p_household UUID)
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    email TEXT,
    role TEXT,
    is_self BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        u.id,
        COALESCE(p.display_name, 'FreshTrack User'),
        p.avatar_url,
        u.email,
        hm.role::text,
        (u.id = auth.uid())
    FROM household_members hm
    JOIN auth.users u ON u.id = hm.user_id
    LEFT JOIN profiles p ON p.id = u.id
    WHERE hm.household_id = p_household
      AND is_household_member(p_household)
    ORDER BY (hm.role::text = 'owner') DESC, hm.joined_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION get_household_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_household_members(UUID) TO authenticated;

-- 10. Role helpers: can the current user EDIT (owner/editor) / is the OWNER of a household?
--     Used by RLS write policies (role-based permissions) and by mutating RPCs.
CREATE OR REPLACE FUNCTION can_edit_household(target_household UUID)
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
          AND hm.role IN ('owner', 'editor')
    );
$$;

CREATE OR REPLACE FUNCTION is_household_owner(target_household UUID)
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
          AND hm.role = 'owner'
    );
$$;

-- 11. get_my_households(): every household the current user belongs to (for switching).
CREATE OR REPLACE FUNCTION get_my_households()
RETURNS TABLE (
    id UUID,
    name TEXT,
    invite_code TEXT,
    role TEXT,
    member_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT h.id, h.name, h.invite_code, hm.role::text,
           (SELECT count(*)::bigint FROM household_members m2 WHERE m2.household_id = h.id)
    FROM household_members hm
    JOIN households h ON h.id = hm.household_id
    WHERE hm.user_id = auth.uid()
    ORDER BY (hm.role::text = 'owner') DESC, h.name ASC;
$$;
REVOKE EXECUTE ON FUNCTION get_my_households() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_households() TO authenticated;

-- 12. join_household(p_invite_code): join a household by invite code (default role: editor).
CREATE OR REPLACE FUNCTION join_household(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    h RECORD;
BEGIN
    SELECT id, name INTO h FROM households WHERE invite_code = p_invite_code;
    IF h.id IS NULL THEN
        RAISE EXCEPTION 'invalid invite code';
    END IF;
    INSERT INTO household_members (household_id, user_id, role)
    VALUES (h.id, auth.uid(), 'editor')
    ON CONFLICT (household_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('household_id', h.id, 'household_name', h.name, 'role', 'editor');
END;
$$;
REVOKE EXECUTE ON FUNCTION join_household(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_household(TEXT) TO authenticated;

-- 13. leave_household(p_household): the current user leaves; owner must transfer/delete first.
CREATE OR REPLACE FUNCTION leave_household(p_household UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_others INT;
BEGIN
    SELECT role::text INTO v_role
    FROM household_members
    WHERE household_id = p_household AND user_id = auth.uid();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'not a member';
    END IF;
    IF v_role = 'owner' THEN
        SELECT count(*) INTO v_others
        FROM household_members
        WHERE household_id = p_household AND user_id <> auth.uid();
        IF v_others > 0 THEN
            RAISE EXCEPTION 'owner must transfer ownership or remove members first';
        END IF;
    END IF;
    DELETE FROM household_members WHERE household_id = p_household AND user_id = auth.uid();
    RETURN jsonb_build_object('left', true, 'household_id', p_household);
END;
$$;
REVOKE EXECUTE ON FUNCTION leave_household(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION leave_household(UUID) TO authenticated;

-- 14. Member management: remove a member / transfer ownership (owner only).
CREATE OR REPLACE FUNCTION remove_member(p_household UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_role TEXT;
BEGIN
    IF NOT is_household_owner(p_household) THEN
        RAISE EXCEPTION 'Only the owner can manage members';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Owner cannot remove themselves; transfer ownership first';
    END IF;
    SELECT role::text INTO v_target_role FROM household_members
    WHERE household_id = p_household AND user_id = p_user_id;
    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'target is not a member';
    END IF;
    DELETE FROM household_members WHERE household_id = p_household AND user_id = p_user_id;
    RETURN jsonb_build_object('removed', p_user_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION remove_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION remove_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION transfer_ownership(p_household UUID, p_new_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_household_owner(p_household) THEN
        RAISE EXCEPTION 'Only the owner can transfer ownership';
    END IF;
    IF p_new_owner_id = auth.uid() THEN
        RAISE EXCEPTION 'already the owner';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM household_members WHERE household_id = p_household AND user_id = p_new_owner_id) THEN
        RAISE EXCEPTION 'target is not a member';
    END IF;
    UPDATE household_members SET role = 'owner' WHERE household_id = p_household AND user_id = p_new_owner_id;
    UPDATE household_members SET role = 'editor' WHERE household_id = p_household AND user_id = auth.uid();
    UPDATE households SET owner_id = p_new_owner_id WHERE id = p_household;
    RETURN jsonb_build_object('new_owner', p_new_owner_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION transfer_ownership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transfer_ownership(UUID, UUID) TO authenticated;
