# Environment variables (names only)

Never commit values. Same list as `.env.example`.

| Name | Where it's used | Where to set it | Public? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser (`src/integrations/supabase/client.ts`) | Platform-managed | Yes, the project's address |
| `VITE_SUPABASE_ANON_KEY` | Browser (same file) | Platform-managed | Yes, anon role only; data protected by Row Level Security |
| `GEOAPIFY_KEY` | Edge functions `geo`, `search` | Cloud → Secrets | No |
| `LOCATIONIQ_KEY` | Edge function `geo` | Cloud → Secrets | No |
| `HEIGIT_KEY` | Edge functions `geo`, `search` | Cloud → Secrets | No |
| `IP_HASH_SECRET` | Edge functions `geo`, `search` | Cloud → Secrets | No |
| `DIAG_KEY` | Edge function `diag` | Cloud → Secrets | No |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SB_REGION` | Edge functions | Provided automatically | Service role key: no, never in the browser |
