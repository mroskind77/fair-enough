import { test } from "node:test";
import assert from "node:assert/strict";
import { fairSort, fairerBelowId, resortTop3, settleTop3 } from "../src/lib/ranking.ts";
import { aroma, avi, fill, mcd, real, venue } from "./fixtures.ts";

const gaps = (vs: { gap: number }[]) => vs.map((v) => v.gap);

test("sort: Aroma 16 / McDonald's 3 / Avi Kabab 5 → 3, 5, 16", () => {
  assert.deepEqual(gaps(fairSort([aroma, mcd, avi])), [3, 5, 16]);
});

test("sort: the one re-sort puts the top 3 in order 3, 5, 16", () => {
  const out = resortTop3([aroma, mcd, avi]);
  assert.deepEqual(out.map((v) => v.id), ["McDonald's", "Avi Kabab", "Aroma"]);
});

test("sort: same gap → real before ~, then shorter longest trip, then distance", () => {
  const guess = venue("guess", [20, 25], { estimate: true }); // gap 5, ~
  const realLong = venue("realLong", [40, 45]); // gap 5, max 45
  const realShortFar = venue("realShortFar", [20, 25], { dist: 30 }); // gap 5, max 25
  const realShortNear = venue("realShortNear", [20, 25], { dist: 12 });
  assert.deepEqual(fairSort([guess, realLong, realShortFar, realShortNear]).map((v) => v.id), [
    "realShortNear",
    "realShortFar",
    "realLong",
    "guess",
  ]);
});

test("re-sort: only the top 3 move; rows 4+ and faded rows keep their place", () => {
  const r4 = venue("r4", [10, 10]); // gap 0, fairer than all but below the top 3
  const faded = venue("faded", [5, 50], { dropped: true });
  const out = resortTop3([aroma, faded, mcd, avi, r4]);
  assert.deepEqual(out.map((v) => v.id), ["McDonald's", "Avi Kabab", "Aroma", "r4", "faded"]);
});

test("'Fairer option below': only rows below the top 3 that are real and beat #1", () => {
  const lead = venue("lead", [20, 26]); // gap 6
  const row2 = venue("row2", [20, 20]); // gap 0 but in top 3 → never hinted
  const row3 = venue("row3", [20, 30]);
  const row4guess = venue("row4", [20, 21], { estimate: true });
  assert.equal(fairerBelowId([lead, row2, row3, row4guess]), null, "a ~ row never triggers it");
  assert.equal(fairerBelowId([lead, row2, row3, real(row4guess)]), "row4");
  assert.equal(fairerBelowId([venue("worse", [20, 40]), row2, row3]), null, "rows 1–3 never");
});

test("settle: re-sort waits until ALL top-3 rows are real (asks again for rows still ~)", async () => {
  const a = venue("A", [20, 36], { estimate: true });
  const b = venue("B", [30, 33], { estimate: true });
  const c = venue("C", [28, 33], { estimate: true });
  const asked: string[][] = [];
  let round = 0;
  const res = await settleTop3({
    venues: [a, b, c, venue("D", [1, 1], { estimate: true })],
    fetchOut: async (ids) => {
      asked.push(ids);
      round++;
      // Round 1: only A comes back real; B and C timed out. Round 2: the rest.
      return fill(round === 1 ? [real(a)] : [real(b), real(c)]);
    },
  });
  assert.equal(res.reason, "settled");
  assert.deepEqual(asked, [["A", "B", "C"], ["B", "C"]], "row D (4th) is never fetched on load");
  assert.deepEqual(gaps(resortTop3(res.top)), [3, 5, 16]);
});

test("settle: a failed row ends its wait", async () => {
  const a = venue("A", [20, 36], { estimate: true });
  const b = venue("B", [30, 33], { estimate: true });
  const res = await settleTop3({
    venues: [a, b],
    fetchOut: async () => fill([real(a)], { dropped: [{ id: "B", why: "no_service", who: 0 }] } as never),
  });
  assert.equal(res.reason, "settled");
  assert.deepEqual(res.top.map((v) => v.id), ["A"]);
});

test("settle: stops waiting at the 15 s limit when a lookup never answers", async () => {
  const a = venue("A", [20, 36], { estimate: true });
  const t0 = Date.now();
  const res = await settleTop3({ venues: [a], waitMs: 1600, fetchOut: () => new Promise(() => {}) });
  assert.equal(res.reason, "timeout");
  assert.ok(Date.now() - t0 < 2500);
  // The default limit is 15 s.
  const { TOP3_WAIT_MS } = await import("../src/lib/ranking.ts");
  assert.equal(TOP3_WAIT_MS, 15000);
});
