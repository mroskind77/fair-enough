import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrivalSummary,
  EARLY_MAX_MIN,
  ENOUGH,
  isAirside,
  isJunkName,
  latestArrival,
  pickRadiusStep,
  SCALES,
} from "../supabase/functions/_shared/rules.ts";

test("radius: 8 / 48 / 217 usable → middle step, no 'looked further out'", () => {
  assert.deepEqual(pickRadiusStep([8, 48, 217]), { idx: 1, widened: false });
});
test("radius: steps in order; largest only when the middle is short too → 'looked further out'", () => {
  assert.deepEqual(pickRadiusStep([20, 48, 217]), { idx: 0, widened: false });
  assert.deepEqual(pickRadiusStep([8, 14, 217]), { idx: 2, widened: true });
  assert.deepEqual(pickRadiusStep([8, 14, 3]), { idx: 2, widened: true }, "largest is the last resort");
  assert.deepEqual(pickRadiusStep([8, 14, 217], 2), { idx: 2, widened: false }, "user-chosen wider is not 'widened'");
  assert.equal(ENOUGH, 15);
  assert.deepEqual([...SCALES], [1, 1.6, 2.56]);
});

test("name filter: exact list only", () => {
  assert.equal(isJunkName("Demo 364"), false);
  assert.equal(isJunkName("Test Kitchen"), false);
  assert.equal(isJunkName("test"), true);
  assert.equal(isJunkName("  TEST "), true);
  assert.equal(isJunkName("בדיקה"), true);
  assert.equal(isJunkName("dummy"), true);
  assert.equal(isJunkName("sample"), true);
  assert.equal(isJunkName("קפה בדיקה"), false);
  assert.equal(isJunkName(undefined, "Real Café"), false);
});

test("airport terminals excluded, Airport City kept", () => {
  assert.equal(isAirside(32.0004, 34.8707, {}), true, "Terminal 3");
  assert.equal(isAirside(31.98, 34.9, { aeroway: "terminal" }), true);
  assert.equal(isAirside(31.988, 34.912, {}), false, "Airport City");
});

const MEET = Date.parse("2026-11-26T14:00:00Z");
const it = (startMin: number, endMin: number, safe = true) => ({ start: MEET + startMin * 60000, end: MEET + endMin * 60000, safe });

test("arrive-by: latest safe on-time trip; late and unsafe trips skipped", () => {
  const its = [it(-70, -30), it(-50, -8), it(-40, 5), it(-45, -3, false)];
  const { best, anyOnTime } = latestArrival(its, MEET);
  assert.equal(anyOnTime, true);
  assert.equal(best, its[1]);
  assert.deepEqual(latestArrival([it(-10, 10)], MEET), { best: null, anyOnTime: false });
});

test("leave-time and 'arrives N min early' only over 20 min", () => {
  const s = arrivalSummary(it(-70, -25), MEET);
  assert.equal(s.minutes, 45);
  assert.equal(s.leaveMs, MEET - 70 * 60000);
  assert.equal(s.early, 25);
  assert.equal(arrivalSummary(it(-50, -20), MEET).early, undefined, "exactly 20 → no note");
  assert.equal(arrivalSummary(it(-50, -21), MEET).early, 21);
  assert.equal(EARLY_MAX_MIN, 20);
});
