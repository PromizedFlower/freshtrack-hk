-- FreshTrack HK — 5 Demo Accounts across 3 Households (run AFTER auth users exist via Admin API)
-- Split 2 / 2 / 1 so each family has its own independent data.
--
--   demo1@freshtrack.hk / FreshTrackDemo123!  ->  陳家 owner   陳先生
--   demo2@freshtrack.hk / FreshTrackDemo123!  ->  陳家 editor  陳太
--   demo3@freshtrack.hk / FreshTrackDemo123!  ->  李家 owner   李小姐
--   demo4@freshtrack.hk / FreshTrackDemo123!  ->  李家 editor  李婆婆
--   demo5@freshtrack.hk / FreshTrackDemo123!  ->  周家 owner   周同學
--
-- Create the auth users with:
--   POST {SUPABASE_URL}/auth/v1/admin/users  (service_role key)
--   body: { email, password: 'FreshTrackDemo123!', email_confirm: true,
--           user_metadata: { display_name: '陳先生' } }
-- Then run this file to wire profiles + membership by email (idempotent).

INSERT INTO profiles (id, display_name)
SELECT u.id, r.display_name
FROM (VALUES
    ('demo1@freshtrack.hk', '陳先生'),
    ('demo2@freshtrack.hk', '陳太'),
    ('demo3@freshtrack.hk', '李小姐'),
    ('demo4@freshtrack.hk', '李婆婆'),
    ('demo5@freshtrack.hk', '周同學')
) AS r(email, display_name)
JOIN auth.users u ON u.email = r.email
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- Re-wire membership: 陳家(2) / 李家(2) / 周家(1). Idempotent.
INSERT INTO household_members (household_id, user_id, role)
SELECT h.id, u.id, r.role
FROM (VALUES
    ('CHEN01', 'demo1@freshtrack.hk', 'owner'),
    ('CHEN01', 'demo2@freshtrack.hk', 'editor'),
    ('LEE01',  'demo3@freshtrack.hk', 'owner'),
    ('LEE01',  'demo4@freshtrack.hk', 'editor'),
    ('CHOW01', 'demo5@freshtrack.hk', 'owner')
) AS r(invite_code, email, role)
JOIN households h ON h.invite_code = r.invite_code
JOIN auth.users u ON u.email = r.email
ON CONFLICT (household_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- Point each household owner at its owner account (idempotent).
UPDATE households SET owner_id = (SELECT id FROM auth.users WHERE email = 'demo1@freshtrack.hk') WHERE invite_code = 'CHEN01';
UPDATE households SET owner_id = (SELECT id FROM auth.users WHERE email = 'demo3@freshtrack.hk') WHERE invite_code = 'LEE01';
UPDATE households SET owner_id = (SELECT id FROM auth.users WHERE email = 'demo5@freshtrack.hk') WHERE invite_code = 'CHOW01';
