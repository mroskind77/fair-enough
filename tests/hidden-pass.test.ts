import { test } from "node:test";
import assert from "node:assert/strict";
import { HIDDEN_PASS, keepTop3Fair, pickBest3, searchLogLine, settleTop3 } from "../src/lib/ranking.ts";
import { fill, plan, real, venue } from "./fixtures.ts";

const ids = (vs: { id: string }[]) => vs.map((v) => v.id);

test("hidden pass: real trips for the top 6 (5 rows + 1 more), then best 3 by real gap are rows 1-3", async () => {
  // Estimates: A..E on screen, F is the 6th by estimate. Real gaps: A 16, B 12, C 9, D 30, E 25, F 2.
  const est = ["A", "B", "C", "D", "E"].map((id, i) => venue(id, [30, 31 + i], { estimate: true }));
  const truth = {
    A: venue("A", [20, 36]),
    B: venue("B", [20, 32]),
    C: venue("C", [20, 29]),
    D: venue("D", [10, 40]),
    E: venue("E", [10, 35]),
    F: venue("F", [30, 32]),
  };
  const asked: { ids: string[]; extra: number }[] = [];
  let shown = est;
  const res = await settleTop3({
    n: HIDDEN_PASS,
    venues: est,
    fetchOut: async (want, _phase, _first, extra) => {
      asked.push({ ids: want, extra });
      const vs = want.map((id) => truth[id as keyof typeof truth]);
      if (extra) vs.push(truth.F);
      return fill(vs);
    },
    onAnswer: (r) => {
      const fresh = new Map(r.venues.map((v) => [v.id, v]));
      shown = shown.map((v) => fresh.get(v.id) ?? v);
      for (const v of r.venues) if (!shown.some((s) => s.id === v.id)) shown.push(v);
    },
  });
  assert.equal(res.reason, "settled");
  assert.deepEqual(asked, [{ ids: ["A", "B", "C", "D", "E"], extra: 1 }], "one call: 5 rows + 1 more place");
  const out = pickBest3(shown);
  assert.deepEqual(ids(out), ["F", "C", "B", "A", "E", "D"], "best 3 (2, 9, 12) first, then the other 3 in fair order");
});

test("hidden pass waits at most 15 s; a place still on ~ can't take a top-3 spot from real ones", async () => {
  const est = ["A", "B", "C", "D", "E", "F"].map((id, i) => venue(id, [30, 31 + i], { estimate: true }));
  let t = 0;
  const res = await settleTop3({
    n: HIDDEN_PASS,
    venues: est,
    now: () => t,
    waitMs: 15000,
    fetchOut: async (want) => {
      t += 16000; // the answer comes after 15 s
      return fill(want.filter((id) => id !== "A").map((id) => real(est.find((v) => v.id === id)!)));
    },
  });
  assert.equal(res.reason, "timeout");
  // A (smallest estimate gap, still ~) doesn't take a top-3 spot over 3 real rows.
  const withReal = est.map((v) => (v.id === "A" ? v : real(v)));
  assert.deepEqual(ids(pickBest3(withReal)).slice(0, 3), ["B", "C", "D"]);
});

test("a late real answer for one of rows 1-3 re-sorts only those 3; rows 4+ never move", () => {
  const rows = [venue("A", [20, 30]), venue("B", [20, 32]), venue("C", [20, 34]), venue("D", [20, 21]), venue("E", [20, 50])];
  const lateA = [{ ...venue("A", [10, 50]) }, ...rows.slice(1)];
  assert.deepEqual(ids(keepTop3Fair(lateA, ["A"])), ["B", "C", "A", "D", "E"]);
  // A late answer for row 4 changes nothing.
  assert.deepEqual(ids(keepTop3Fair(rows, ["D"])), ids(rows));
});

test("[search] line: time, both places, modes and radius step", () => {
  const line = searchLogLine(plan as never, { radiusScale: 1.6, capBonus: 0 }, new Date("2026-11-26T15:00:00Z"));
  assert.match(line, /^\[search\] 2026-11-26T15:00:00\.000Z \| A: .+ \((transit|car|walk|carpool)\) \| B: .+ \| radius step 2\/3/);
});
