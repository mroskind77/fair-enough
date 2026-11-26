#!/bin/sh
# Runs the fixture-only tests (no network) and the secrets scan. See RULES.md.
set -e
cd "$(dirname "$0")/.."
node scripts/sync-shared.mjs --check >/dev/null
# Secrets scan (RULES.md 22): fails on any hard-coded secret. Prints names/kinds only, never values.
node scripts/scan-secrets.mjs
node --test tests/*.test.ts
node_modules/.bin/vitest run
