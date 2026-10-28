#!/usr/bin/env bash
# Deploy FreshTrack HK edge functions to Supabase.
# Prereqs: Supabase CLI  ->  https://supabase.com/docs/guides/cli
#   supabase login
#   supabase link --project-ref cjqmeypqkxvnyojpyexw
#
# Usage:  bash deploy-functions.sh

set -euo pipefail
cd "$(dirname "$0")/.."   # -> backend/

# 1. Set secrets (one-time). Replace placeholders with real values (see SECRETS.md).
supabase secrets set \
  GEMINI_API_KEY=your_google_gemini_api_key \
  SUPABASE_URL=https://cjqmeypqkxvnyojpyexw.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# 2. Deploy MVP-core functions (5-screen demo).
for fn in ai-scan-receipt ai-scan-food match-recipes cook-recipe; do
  echo "==> Deploying $fn"
  supabase functions deploy "$fn"
done

# 3. Optional (P2/P3 — not required for the 5-screen demo). Uncomment to deploy.
# for fn in ai-scan barcode-lookup notify household shopping-list snapshot-diff; do
#   echo "==> Deploying $fn"
#   supabase functions deploy "$fn"
# done

echo "All done. Verify at: https://cjqmeypqkxvnyojpyexw.supabase.co/functions/v1/"
