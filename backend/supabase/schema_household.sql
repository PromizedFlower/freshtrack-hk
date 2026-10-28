-- FreshTrack HK — P3-1 Household Invite & Member Management (Incremental Migration)
-- Completes the multi-user sharing loop on top of schema_auth.sql (profiles + household_members).

-- Join a household via its 6-char invite code.
CREATE OR REPLACE FUNCTION join_household(p_user UUID, p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_hid UUID;
BEGIN
    SELECT id INTO v_hid FROM households WHERE invite_code = p_invite_code;
    IF v_hid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite_code');
    END IF;

    INSERT INTO household_members (household_id, user_id, role)
    VALUES (v_hid, p_user, 'editor')
    ON CONFLICT (household_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'household_id', v_hid);
END;
$$;

-- List members with display names.
CREATE OR REPLACE FUNCTION list_household_members(p_household UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'user_id', hm.user_id,
                'role', hm.role,
                'display_name', COALESCE(p.display_name, 'FreshTrack User'),
                'joined_at', hm.joined_at
            )
            ORDER BY hm.joined_at
        ),
        '[]'::jsonb
    )
    FROM household_members hm
    LEFT JOIN profiles p ON p.id = hm.user_id
    WHERE hm.household_id = p_household;
$$;

-- Leave a household (owner cannot leave while others remain; owner leaving deletes the household).
CREATE OR REPLACE FUNCTION leave_household(p_user UUID, p_household UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_role TEXT;
    v_member_count INT;
BEGIN
    SELECT role INTO v_role FROM household_members
    WHERE household_id = p_household AND user_id = p_user;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
    END IF;

    IF v_role = 'owner' THEN
        SELECT COUNT(*) INTO v_member_count FROM household_members WHERE household_id = p_household;
        IF v_member_count > 1 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'owner_must_transfer_or_remove_members_first');
        END IF;
        DELETE FROM households WHERE id = p_household;
        RETURN jsonb_build_object('ok', true, 'household_deleted', true);
    END IF;

    DELETE FROM household_members WHERE household_id = p_household AND user_id = p_user;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Owner removes a member.
CREATE OR REPLACE FUNCTION remove_household_member(p_owner UUID, p_household UUID, p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_role TEXT;
BEGIN
    SELECT role INTO v_owner_role FROM household_members
    WHERE household_id = p_household AND user_id = p_owner;
    IF v_owner_role IS DISTINCT FROM 'owner' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'owner_only');
    END IF;
    IF p_target = p_owner THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cannot_remove_self');
    END IF;

    DELETE FROM household_members WHERE household_id = p_household AND user_id = p_target;
    RETURN jsonb_build_object('ok', true);
END;
$$;
