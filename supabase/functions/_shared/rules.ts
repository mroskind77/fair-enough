// Fair Enough — pure rules shared by the search function and the tests (see RULES.md). No imports, no network.
// Edit here, then run: node scripts/sync-shared.mjs  (copies this block into supabase/functions/search/index.ts).

/** Only a whole name of test/dummy/sample/בדיקה (trimmed, any case) is dropped. "Demo 364" stays. */
export const JUNK_NAME = /^(test|dummy|sample|בדיקה)$/i;
export function isJunkName(...names: (string | undefined | null)[]) {
	return names.some((n) => Boolean(n) && JUNK_NAME.test(n!.trim()));
}

/**
 * Airport terminals and airside areas: not reachable for a meeting. Box per airfield, west of Route 40 / north of
 * Route 1 for Ben Gurion so Airport City stays in.
 */
export const AIRFIELDS: [number, number, number, number][] = [
	[34.855, 31.993, 34.9, 32.025], // Ben Gurion (TLV), terminals 1 and 3 and the airfield
	[34.995, 29.712, 35.028, 29.748], // Ramon (ETM)
	[35.033, 32.802, 35.052, 32.816], // Haifa (HFA)
];
export function isAirside(lat: number, lon: number, tags: Record<string, string>) {
	if (tags.aeroway || tags.airside === 'yes') return true;
	return AIRFIELDS.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);
}

/** Fewer usable places than this at a radius step → try the next step. */
export const ENOUGH = 15;
/** Radius multipliers: 15% of the widest pair → middle → largest. */
export const SCALES = [1, 1.6, 2.56] as const;
/** Stop at this step? (enough usable places, or nothing larger left) */
export const radiusStepDone = (usable: number, idx: number, last: number) => usable >= ENOUGH || idx >= last;
/** "Not much nearby, so we looked further out" only when the search itself had to go to the largest step. */
export const radiusWidened = (idx: number, startIdx: number, last: number) => idx === last && startIdx < idx;
/** Steps tried in order, stopping at the first with ≥ ENOUGH usable places (given the usable count of each step). */
export function pickRadiusStep(usable: number[], startIdx = 0): { idx: number; widened: boolean } {
	const last = usable.length - 1;
	let idx = Math.max(0, Math.min(startIdx, last));
	while (!radiusStepDone(usable[idx], idx, last)) idx++;
	return { idx, widened: radiusWidened(idx, startIdx, last) };
}

/** Arriving more than this many minutes early is said out loud on the row ("arrives N min early"). */
export const EARLY_MAX_MIN = 20;

export interface ItinLike {
	start: number;
	end: number;
	safe: boolean;
}
/** Arrive-by: the on-time, safe itinerary that arrives last (ties: the one leaving later). */
export function latestArrival<T extends ItinLike>(its: T[], meetMs: number): { best: T | null; anyOnTime: boolean } {
	const onTime = its.filter((it) => it.end <= meetMs + 60000);
	const safe = onTime.filter((it) => it.safe);
	const best = safe.length ? safe.reduce((a, b) => (b.end > a.end || (b.end === a.end && b.start > a.start) ? b : a)) : null;
	return { best, anyOnTime: onTime.length > 0 };
}
/** Trip minutes, leave-by time and the early note (only over EARLY_MAX_MIN) for the chosen arrive-by trip. */
export function arrivalSummary(best: ItinLike, meetMs: number): { minutes: number; leaveMs: number; early?: number } {
	const early = Math.round((meetMs - best.end) / 60000);
	return {
		minutes: Math.max(1, Math.round((best.end - best.start) / 60000)),
		leaveMs: best.start,
		early: early > EARLY_MAX_MIN ? early : undefined,
	};
}
