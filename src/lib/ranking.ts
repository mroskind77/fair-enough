// Fair Enough — pure result-order and search-trigger rules (see RULES.md). No network, no React, type-only imports,
// so the tests in /tests can load it directly with Node.
import type { FillIn, FillPhase, SearchOptions, Venue } from "./search-client";
import type { Occasion } from "./chips";
import type { Plan } from "./plan-store";
import type { Lang } from "./prefs";

/** A bus/train time that is still a rough guess (no real trip yet). */
export const isRoughRow = (v: Venue) => v.per.some((p) => p.mode === "transit" && Boolean(p.estimate));
const guessedRow = (v: Venue) => (v.per.some((p) => p.estimate) ? 1 : 0);

/**
 * "Fairest first": smallest gap (longest minus shortest trip) first. Same gap: real times before guessed (~) ones,
 * then the shorter longest trip, then the shorter total distance. Same order as the server.
 */
export function fairCmp(a: Venue, b: Venue) {
  return a.gap - b.gap || guessedRow(a) - guessedRow(b) || a.max - b.max || (a.dist ?? 0) - (b.dist ?? 0);
}
export const fairSort = (list: Venue[]) => [...list].sort(fairCmp);
/** Live rows in fair order, faded (dropped) rows after them. */
export const finalSort = (list: Venue[]) => [...fairSort(list.filter((v) => !v.dropped)), ...list.filter((v) => v.dropped)];

/** The one re-sort: only the top 3 live rows are sorted among themselves; rows 4+ and faded rows keep their place. */
export function resortTop3(venues: Venue[]): Venue[] {
  const live = venues.filter((v) => !v.dropped);
  return [...fairSort(live.slice(0, 3)), ...live.slice(3), ...venues.filter((v) => v.dropped)];
}

/** "Fairer option below": only a row beyond the top 3, with real times, that beats #1 (itself real). */
export function fairerBelowId(liveVenues: Venue[]): string | null {
  const lead = liveVenues[0];
  if (!lead || isRoughRow(lead)) return null;
  for (let i = 3; i < liveVenues.length; i++) {
    const v = liveVenues[i];
    if (!isRoughRow(v) && fairCmp(lead, v) > 0) return v.id;
  }
  return null;
}

export const TOP3_WAIT_MS = 15000;
/** Hidden pass: real trips for this many rows (top 5 on screen + the next one), then the best 3 become rows 1–3. */
export const HIDDEN_PASS = 6;

/**
 * After the hidden pass: among the first 6 live rows, the 3 with the best real gap become rows 1–3 (fair order);
 * the other 3 follow in fair order. Fewer than 3 real → the best "~" rows fill the gap. Rows 7+ and faded rows stay.
 */
export function pickBest3(venues: Venue[], n = HIDDEN_PASS): Venue[] {
  const live = venues.filter((v) => !v.dropped);
  const head = live.slice(0, n);
  const realRows = fairSort(head.filter((v) => !isRoughRow(v)));
  const best = realRows.slice(0, 3);
  if (best.length < 3) best.push(...fairSort(head.filter(isRoughRow)).slice(0, 3 - best.length));
  const ids = new Set(best.map((v) => v.id));
  return [...fairSort(best), ...fairSort(head.filter((v) => !ids.has(v.id))), ...live.slice(n), ...venues.filter((v) => v.dropped)];
}

/**
 * Rows 1–3 stay in fair order: when a late answer changes one of them (after the re-sort), only those 3 are sorted
 * again among themselves. Rows 4+ never move (a fairer one there gets the "Fairer option below" hint instead).
 */
export function keepTop3Fair(venues: Venue[], changedIds: Iterable<string>): Venue[] {
  const top = new Set(venues.filter((v) => !v.dropped).slice(0, 3).map((v) => v.id));
  for (const id of changedIds) if (top.has(id)) return resortTop3(venues);
  return venues;
}

/**
 * Real trips for the first `n` rows (the hidden pass), before the one re-sort. Asks only for rows still on "~"
 * (phase 'out': trips there, never rides home); the first call also asks for `n - shown` more places from the list.
 * Repeats for rows whose lookup timed out, and returns once all are real or failed, or the 15 s wait is up.
 * `fetchOut` is the network call; tests pass a fake.
 */
export async function settleTop3(opts: {
  venues: Venue[];
  fetchOut: (ids: string[], phase: FillPhase, first: boolean, extra: number) => Promise<FillIn>;
  onAnswer?: (r: FillIn) => void;
  now?: () => number;
  waitMs?: number;
  cancelled?: () => boolean;
  /** Rows to settle: 3 (top 3 only) or HIDDEN_PASS. */
  n?: number;
}): Promise<{ top: Venue[]; reason: "settled" | "timeout" | "cancelled" }> {
  const now = opts.now ?? Date.now;
  const n = opts.n ?? 3;
  const deadline = now() + (opts.waitMs ?? TOP3_WAIT_MS);
  let top = opts.venues.filter((v) => !v.dropped).slice(0, n);
  let first = true;
  for (;;) {
    if (opts.cancelled?.()) return { top, reason: "cancelled" };
    const ids = top.filter(isRoughRow).map((v) => v.id);
    const extra = first ? Math.max(0, n - top.length) : 0;
    if (!ids.length && !extra) return { top, reason: "settled" };
    const left = deadline - now();
    if (left < 1500) return { top, reason: "timeout" };
    // A late answer still fills in its row; the sort just doesn't wait past 15 s.
    const call = opts.fetchOut(ids, "out", first, extra).then((r) => {
      opts.onAnswer?.(r);
      return r;
    });
    first = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([
      call.catch(() => null),
      new Promise<null>((res) => {
        timer = setTimeout(() => res(null), left);
      }),
    ]);
    clearTimeout(timer);
    if (!r) return { top, reason: "timeout" };
    const fresh = new Map(r.venues.map((v) => [v.id, v]));
    const swap = new Map((r.replaced ?? []).map((x) => [x.from, x.venue]));
    const failed = new Set(r.dropped.map((d) => d.id));
    top = top.map((v) => swap.get(v.id) ?? fresh.get(v.id) ?? v);
    // Places added by this answer (the hidden pass's extra rows) join the set being settled.
    const have = new Set(top.map((v) => v.id));
    for (const v of r.venues) if (!have.has(v.id) && top.length < n) top.push(v);
    top = top.filter((v) => !failed.has(v.id));
  }
}

export function buildRequest(plan: Plan, lang: Lang, opts: SearchOptions) {
  return {
    people: plan.people.map((p) => ({ lat: p.place!.lat, lon: p.place!.lon, mode: p.mode })),
    meetAt: plan.meetAt!,
    durationMin: plan.durationMin,
    occasion: plan.occasion as Occasion,
    chips: plan.chips,
    kosher: plan.kosher,
    lang,
    radiusScale: opts.radiusScale,
    capBonus: opts.capBonus,
  };
}

/** What makes a new search: the plan only. Language is not part of it (EN/HE re-renders, never searches). */
export function searchFingerprint(plan: Plan): string {
  return JSON.stringify({ ...buildRequest(plan, "he", { radiusScale: 1, capBonus: 0 }), lang: undefined });
}

/** On the results page: restore the stored results for the same plan, otherwise search (when online). */
export function onPlanChange(storedFp: string | null, fp: string, online: boolean): "restore" | "search" | "wait" {
  if (storedFp === fp) return "restore";
  return online ? "search" : "wait";
}

const STEP_OF: Record<number, number> = { 1: 1, 1.6: 2, 2.56: 3 };
/** One console line per search start: time, each place and mode, radius step. Never on language/theme switches. */
export function searchLogLine(plan: Plan, opts: SearchOptions, at: Date): string {
  const who = plan.people.map((p, i) => `${String.fromCharCode(65 + i)}: ${p.place?.label ?? p.text} (${p.mode})`).join(" | ");
  const step = STEP_OF[opts.radiusScale] ?? 1;
  return `[search] ${at.toISOString()} | ${who} | radius step ${step}/3 (×${opts.radiusScale})${opts.capBonus ? ` | cap +${opts.capBonus}` : ""}`;
}
