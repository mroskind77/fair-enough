import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRequest, onPlanChange, settleTop3 } from "../src/lib/ranking.ts";
import { searchFingerprint } from "../src/lib/ranking.ts";
import { fill, plan, real, venue } from "./fixtures.ts";

/** The results page's search trigger, driven the way the page drives it: fingerprint + stored result. */
function harness() {
  let calls = 0;
  let stored: string | null = null;
  const render = (lang: "he" | "en") => {
    const fp = searchFingerprint(plan);
    if (onPlanChange(stored, fp, true) === "search") {
      calls++;
      buildRequest(plan, lang, { radiusScale: 1, capBonus: 0 });
      stored = fp;
    }
  };
  return { render, calls: () => calls };
}

test("language switch makes zero search calls", () => {
  const h = harness();
  h.render("he");
  assert.equal(h.calls(), 1, "first visit searches once");
  h.render("en");
  h.render("he");
  h.render("en");
  assert.equal(h.calls(), 1, "EN/HE switches add no search");
});

test("search fingerprint ignores language but changes with the plan", () => {
  const fp = searchFingerprint(plan);
  assert.equal(fp.includes('"lang"'), false);
  const other = { ...(plan as object), meetAt: "2026-11-26T17:00" } as never;
  assert.notEqual(searchFingerprint(other), fp);
});

test("results page: no search call depends on language", () => {
  const src = readFileSync(new URL("../src/routes/results.tsx", import.meta.url), "utf8");
  const effect = src.match(/useEffect\(\(\) => \{\n\s+if \(!hasPlan\) return;\n\s+const stored = readStored\(\);[\s\S]*?\}, \[([^\]]*)\]\);/);
  assert.ok(effect, "search-on-plan effect found");
  assert.equal(effect[1].trim(), "hasPlan, baseFp", "effect re-runs only on plan change, never on lang");
  assert.match(src, /hasPlan \? searchFingerprint\(plan\) : ""/);
});

test("ride home not fetched on load: load asks phase 'out' only", async () => {
  const phases: string[] = [];
  const a = venue("A", [20, 36], { estimate: true });
  await settleTop3({
    venues: [a, venue("B", [30, 33], { estimate: true }), venue("C", [10, 12], { estimate: true })],
    fetchOut: async (ids, phase) => {
      phases.push(phase);
      return fill(ids.map((id) => real(venue(id, [10, 12]))));
    },
  });
  assert.deepEqual(phases, ["out"]);
});

test("ride home: the only 'tap'/'home' fill-in on the results page is inside the tap handler", () => {
  const src = readFileSync(new URL("../src/routes/results.tsx", import.meta.url), "utf8");
  const calls = [...src.matchAll(/fillIn\([^)]*\)/g)].map((m) => m[0]);
  const homeCalls = calls.filter((c) => /"(home|tap|row)"/.test(c));
  assert.equal(homeCalls.length, 1);
  const checkHome = src.slice(src.indexOf("const checkHome = useCallback("), src.indexOf("const onRowTap"));
  assert.ok(checkHome.includes(homeCalls[0]), "ride-home call lives in checkHome (row tap)");
  // Server: the 'out' phase never asks for the ride home.
  const server = readFileSync(new URL("../supabase/functions/search/index.ts", import.meta.url), "utf8");
  assert.match(server, /const wantBack = legs !== 'out' &&/);
});
