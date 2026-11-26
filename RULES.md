# Fair Enough — invariants

Read this file before every change. If a requested change conflicts with a rule here, stop and ask the owner first;
don't change the rule silently. Rules marked **[tested]** have automated tests in `/tests` (run: `sh scripts/test.sh`).

## Result order
1. **Sort ("fairest first")** — gap ascending (longest minus shortest trip); same gap: real times before "~" guesses;
   then the shorter longest trip; then the shorter total distance. Client and server use the same order.
   Code: `fairCmp` in `src/lib/ranking.ts`. **[tested]**
2. **Hidden pass, then one re-sort** — on a new search, real trips ("there" only, same Transitous pacing) are fetched
   for the top 6 by estimate (the 5 rows on screen plus the next place). The page waits until all 6 are real or failed,
   or 15 s; then the 3 with the smallest real gap become rows 1–3 (fair order) and the other 3 go next (fair order).
   A place still on "~" never takes a top-3 spot from a real one. After that, a late answer for one of rows 1–3 only
   re-sorts those 3 among themselves (so rows 1–3 are always smallest gap first); rows 4+ never move.
   Code: `settleTop3` (n = `HIDDEN_PASS`), `pickBest3`, `keepTop3Fair`; page: `src/routes/results.tsx`.
   **[tested]** incl. page-level test `tests/ui/results-order.spec.tsx` (cache / late / timeout-then-retry answers).
3. **"Fairer option below"** — only for a row below the top 3 that has real times and beats #1. Never for rows 1–3.
   Code: `fairerBelowId`. **[tested]**
4. Rows 4+ keep "~" until at least 50% of the row is on screen, then fetch their own real trips.
5. Max-travel-time filters never apply to "~" guesses alone.

## Transitous (never change without the owner's written OK)
6. 3 concurrent calls, then 1 every 3 s; 3 s timeout per call; 650 calls/day cap. Pacing is shared through the
   database (`transit_call`), not per instance.
7. 6 h cache for trips. Same cache key and skip rules.
8. The 15-minute skip (and the "Couldn't reach the bus timetable" banner) only on refused connection, HTTP 5xx or
   HTTP 429. A timeout or dropped lookup is not an outage.
9. **Never probe their limits.** No test traffic beyond normal app searches. Tests use fixtures only, no network.
10. User-Agent with app name, version and contact on every call; visible link to transitous.org/sources.

## Search triggers
11. **Language switch never searches or re-ranks** — EN/HE re-renders the same rows (same order, same pin numbers)
    from the names already in each row (`ln`). The search fingerprint excludes language. One `[search]` console line
    (`console.log`) on every search start: time, each place and mode, radius step (`searchLogLine`). Nothing on a
    language or theme switch, and nothing when stored results are shown again for the same plan. Code: `searchFingerprint`, `onPlanChange`. **[tested]**
12. **Ride home is never fetched on load** — only when a row is tapped (phase `tap`). Load uses phase `out` only.
    A failed check shows "Couldn't check the ride home. Try again", never a red warning. **[tested]**

## Places
13. **Radius steps tried in order** — 15% of the widest pair → middle (×1.6) → largest (×2.56), stopping at the first
    step with ≥ 15 usable places. "Not much nearby, so we looked further out" only when the largest step was used.
    Code: `pickRadiusStep` / `radiusStepDone` / `radiusWidened` in `supabase/functions/_shared/rules.ts`. **[tested]**
14. **Name filter — exact list** — only a whole name (trimmed, any case) of `test`, `dummy`, `sample`, `בדיקה` is
    removed. Names that merely contain them ("Demo 364") stay. Code: `isJunkName`. **[tested]**
15. **Airport terminals excluded** — `aeroway`/`airside=yes` tags, and the airfield boxes (Ben Gurion west of Route 40 /
    north of Route 1, so Airport City stays; Ramon; Haifa). Code: `isAirside`. **[tested]**
16. **Areas A/B and Gaza blocked** — places inside or within 0.5 km are dropped; routes through them are rejected.
    Code: `inBlockedArea` / `nearBlocked` in `supabase/functions/search/index.ts`.

## Map
17. The map is created only when its container is visible and has a size, and only one live instance exists.
    Language/theme switches keep the same instance (labels/style updated in place).

## Trips
18. **Arrive-by** — trips are planned to arrive by the meeting time; the chosen trip is the latest safe on-time one.
    Over 20 minutes early shows "arrives N min early". Code: `latestArrival` / `arrivalSummary`. **[tested]**

## Process
- Shared server rules live in `supabase/functions/_shared/*.ts`; run `node scripts/sync-shared.mjs` after editing.
- Every report includes: tests run with pass/fail counts, and a short preview check at 390 px.

## Place suggestions
19. **Duplicates** — same name (normalised) within 3 km is one suggestion: keep the best name match, then the most
    complete address. Same name further apart stays separate.
20. **Wrong place** — a suggestion whose name or address names one of the 20 known cities while its coordinates are
    more than 12 km from that city's centre is dropped (e.g. streets called "Modiin" in other towns). There is no
    postcode→area table, so postcodes are not checked on their own. Code: `supabase/functions/_shared/suggest.ts`
    (copied into `geo` by `scripts/sync-shared.mjs`). **[tested]**

## Form
21. **Default transport** — a new, empty form starts both riders on bus/train (`transit`). A saved plan (same visit)
    keeps the modes that were chosen. A third rider added later starts on car, as before.
    Code: `DEFAULT_MODE`, `initialPlan`, `startPlan` in `src/lib/plan-store.tsx`. **[tested]**

## Secrets
22. **No secrets in code** — API keys, tokens, passwords, private keys, connection strings and webhook URLs are never
    written in any file (code, config, tests, docs, comments). Server secrets (`GEOAPIFY_KEY`, `LOCATIONIQ_KEY`,
    `HEIGIT_KEY`, `IP_HASH_SECRET`, `DIAG_KEY`, and the auto-provided `SUPABASE_SERVICE_ROLE_KEY`) are read only in edge
    functions with `Deno.env.get`, set in Cloud → Secrets. The browser gets only the public Supabase URL and anon key.
    `.env.example` and `ENV_VARS.md` list names, never values. Reports name keys, never show values.
    **Scan before every publish and before any export:** `node scripts/scan-secrets.mjs` (part of `scripts/test.sh`),
    plus `node scripts/scan-secrets.mjs --bundle <downloaded assets>` on the built site. **[tested]**

## Home-screen app (PWA)
23. **Installable** — `/manifest.webmanifest` (id `/`, standalone, portrait, colours from `--fe-bg` `#F4F5F7`) lists
    `icon-192/512` (any) and `icon-maskable-192/512` (maskable, artwork inside the central safe zone, from
    `src/assets/brand/icon-maskable.svg`). `apple-touch-icon.png` is 180×180 with no transparency. Head tags live in
    `src/config/app-head.ts`; the light/dark `theme-color` pair is in `src/routes/__root.tsx` because the router keeps
    only one meta per name. Header, footer and sheets pad with `env(safe-area-inset-*)`. No service worker.
    **[tested]** `tests/pwa.test.ts`.
