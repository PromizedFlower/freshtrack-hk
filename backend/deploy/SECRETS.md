# FreshTrack HK — Required Secrets

> **Do NOT commit real values here.** This file documents *what* secrets are needed and where
> to get them. Real values belong in Supabase Edge Function Secrets (`supabase secrets set ...`)
> and/or a git-ignored local `.env`.

## 1. Supabase project

| Key | Value source |
|---|---|
| `SUPABASE_URL` | `https://cjqmeypqkxvnyojpyexw.supabase.co` (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (starts with `eyJ...`) |
| `SUPABASE_ANON_KEY` | Project Settings → API → `anon`/`public` (safe to put in the client) |

## 2. Gemini AI

| Key | Value source |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |

## 3. Database password (for migrations)

- **Connection string**: Project Settings → Database → *Connection string*.
  - Direct connection is **IPv6-only** (`db.<ref>.supabase.co`); from most local machines use the
    **pooler** (`aws-0-<region>.pooler.supabase.com:6543` or `:5432`, user `postgres.<ref>`).
- Password: set by you at project creation.

## 4. Demo account (for the "Enter Demo" quick-login)

| Field | Value |
|---|---|
| Email | `demo@freshtrack.hk` |
| Password | `FreshTrackDemo123!` |

Create it once via the Auth admin API (or it auto-provisions on first email sign-up):

```bash
curl -X POST "https://cjqmeypqkxvnyojpyexw.supabase.co/auth/v1/admin/users" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@freshtrack.hk","password":"FreshTrackDemo123!","email_confirm":true}'
```

## Deployment order (fresh install)

1. SQL Editor → run `00-run-all.sql` (schema + seeds).
2. SQL Editor → run `seed_demo.sql` (demo household + stock + impact history).
3. Terminal → `bash deploy-functions.sh` (sets secrets + deploys edge functions).
4. Open the mini program in WeChat DevTools (see README).
