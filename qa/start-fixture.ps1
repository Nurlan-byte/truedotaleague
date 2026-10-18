# Browser QA only. Every Supabase request goes to the local in-memory fixture API.
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:8090'
$env:SUPABASE_URL = 'http://127.0.0.1:8090'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'fixture-anon'
$env:SUPABASE_PUBLISHABLE_KEY = 'fixture-anon'
npm run dev -- --host 127.0.0.1 --port 8091
