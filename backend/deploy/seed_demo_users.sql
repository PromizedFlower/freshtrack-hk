-- FreshTrack HK — 5 Demo Accounts (run AFTER the auth users exist via Admin API)
-- Creates 5 test users with different household roles, all sharing the Demo Family Fridge.
--
--   demo1@freshtrack.hk / FreshTrackDemo123!  ->  owner   陳先生
--   demo2@freshtrack.hk / FreshTrackDemo123!  ->  editor  陳太
--   demo3@freshtrack.hk / FreshTrackDemo123!  ->  editor  李小姐
--   demo4@freshtrack.hk / FreshTrackDemo123!  ->  viewer  黃婆婆
--   demo5@freshtrack.hk / FreshTrackDemo123!  ->  editor  周同學
--
-- Create the auth users with:
--   POST {SUPABASE_URL}/auth/v1/admin/users  (service_role key)
--   body: { email, password: 'FreshTrackDemo123!', email_confirm: true,
--           user_metadata: { display_name: '陳先生' } }
-- (or use scripts/create_demo_users.py). Then run this file to wire membership by email.

INSERT INTO profiles (id, display_name)
SELECT u.id, r.display_name
FROM (VALUES
    ('demo1@freshtrack.hk', '陳先生'),
    ('demo2@freshtrack.hk', '陳太'),
    ('demo3@freshtrack.hk', '李小姐'),
    ('demo4@freshtrack.hk', '黃婆婆'),
    ('demo5@freshtrack.hk', '周同學')
) AS r(email, display_name)
JOIN auth.users u ON u.email = r.email
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO household_members (household_id, user_id, role)
SELECT '11111111-1111-4111-8111-111111111111', u.id, r.role
FROM (VALUES
    ('demo1@freshtrack.hk', 'owner'),
    ('demo2@freshtrack.hk', 'editor'),
    ('demo3@freshtrack.hk', 'editor'),
    ('demo4@freshtrack.hk', 'viewer'),
    ('demo5@freshtrack.hk', 'editor')
) AS r(email, role)
JOIN auth.users u ON u.email = r.email
ON CONFLICT (household_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- Point the household owner at demo1 (idempotent).
UPDATE households
SET owner_id = (SELECT id FROM auth.users WHERE email = 'demo1@freshtrack.hk')
WHERE id = '11111111-1111-4111-8111-111111111111';
