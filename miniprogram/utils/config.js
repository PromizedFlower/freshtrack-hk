// FreshTrack HK — client configuration
// ANON_KEY is a public client key (by design); it is safe to ship in the frontend.
module.exports = {
  SUPABASE_URL: 'https://cjqmeypqkxvnyojpyexw.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcW1leXBxa3h2bnlvanB5ZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODg1MjksImV4cCI6MjEwODc2NDUyOX0.mjEXAQAiHAbYLKaBOF1KOIhoqfmiRIy7O0t-kGt2y_Y',
  FUNCTIONS_BASE: 'https://cjqmeypqkxvnyojpyexw.supabase.co/functions/v1',
  DEMO_PASSWORD: 'FreshTrackDemo123!',
  // 5 test accounts across 3 independent households (2 / 2 / 1) for one-tap demo login.
  DEMO_ACCOUNTS: [
    { email: 'demo1@freshtrack.hk', name: '陳先生', role: 'owner', emoji: '👨', household: '陳家' },
    { email: 'demo2@freshtrack.hk', name: '陳太', role: 'editor', emoji: '👩', household: '陳家' },
    { email: 'demo3@freshtrack.hk', name: '李小姐', role: 'owner', emoji: '👩‍💼', household: '李家' },
    { email: 'demo4@freshtrack.hk', name: '李婆婆', role: 'editor', emoji: '👵', household: '李家' },
    { email: 'demo5@freshtrack.hk', name: '周同學', role: 'owner', emoji: '🧑', household: '周家' },
  ],
};
