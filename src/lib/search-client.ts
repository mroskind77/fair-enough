import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import type { Mode } from '@/lib/plan-store';
import type { buildRequest } from '@/lib/ranking';
import type { Lang } from '@/lib/prefs';

/** One part of a bus/train trip. `m` is WALK, BUS, TRAM, SUBWAY, RAIL, REGIONAL_RAIL, ... Times are Israel wall clock. */
export interface Leg {
	m: string;
	line?: string;
	from?: string;
	to?: string;
	dep: string;
	arr: string;
	headsign?: string;
}

export interface PerPerson {
	minutes: number;
	leaveBy: string;
	mode: Mode;
	estimate: boolean;
	/** Bus/train only: the trip there (arriving on time, leaving as late as possible) and the ride home. */
	out?: Leg[];
	back?: Leg[];
	/** Latest ride home leaving within 45 minutes after the meeting. */
	lastHome?: string;
	/** ok = a real trip home was found; unchecked = timetables didn't answer in time. */
	/** 'none' = checked on tap: no bus or train home in the 45 minutes after the meeting. */
	ride?: 'ok' | 'unchecked' | 'none';
	/** Bus/train: minutes early when even the latest trip arrives more than 20 min before the meeting. */
	early?: number;
}

export interface Venue {
	id: string;
	name: string;
	altName?: string;
	/** Both spellings, for switching EN/HE without a new search. */
	ln?: { he?: string; en?: string; base: string; alt?: string };
	chip: string;
	lat: number;
	lon: number;
	source: 'osm' | 'overture';
	per: PerPerson[];
	max: number;
	gap: number;
	/** Sum of straight-line km from each person: last tie-break of the fair order. */
	dist?: number;
	score: number;
	/** open = open for the whole meeting (places that close during it are never returned). */
	hours: 'open' | 'unknown';
	hoursRaw?: string;
	/** Closing time after the meeting starts (local wall time "YYYY-MM-DDTHH:MM"), or '24h'. */
	openTill?: string;
	kosher: 'listed' | 'not' | 'none' | null;
	/** Added under the kosher fallback banner ("No kosher info"). */
	kosherFallback?: boolean;
	website?: string;
	phone?: string;
	fit: boolean;
	/** Set on this device when the fill-in found the place doesn't work. The row stays, faded, in its place. */
	dropped?: DropReason;
}

export type DropReason = 'no_ride_home' | 'no_service' | 'unsafe_route' | 'too_far' | 'unverified';

export type Blocker =
	| 'no_places'
	| 'few_places'
	| 'hours'
	| 'shabbat'
	| 'shabbat_transit'
	| 'kosher'
	| 'cap'
	| 'no_route'
	| 'no_ride_home'
	| 'no_service'
	| 'unsafe_route';

/** Places dropped while checking the page: no ride home, no bus/train arriving in time, route through Area A/B. */
export interface Hidden {
	noRideHome: number;
	noService: number;
	unsafeRoute: number;
	tooFar: number;
	/** Places whose route couldn't be checked for safety in time. */
	unverified?: number;
	/** Person (0-based) with no ride home, or -1. */
	noRideWho: number;
}

export interface ShabbatMeta {
	inside: boolean;
	kind?: 'shabbat' | 'yomtov';
	/** Havdalah, Israel local time. */
	ends?: string;
	/** Suggested new meeting time after Shabbat / the holiday. */
	tryAt?: string;
	/** Exact times were unavailable; the day is known but times are approximate. */
	approximate: boolean;
}

export interface SearchMeta {
	radiusKm: number;
	radiusScale: number;
	cap: number;
	blocker: Blocker | null;
	shabbat?: ShabbatMeta;
	kosherFallback?: number;
	counts: {
		found: number;
		kosherDropped: number;
		tooFar: number;
		unreachable: number;
		blocked?: number;
		closed?: number;
		shabbatDropped?: number;
		widened?: number;
	};
	sources: { places: string; car?: string; walk?: string; transit?: string };
	/** Real timetables were used for bus and train (otherwise every bus/train time is an estimate). */
	transitLive?: boolean;
	/** The 15-minute Transitous skip is on (refused, 5xx or 429). The only case that shows the timetable banner. */
	transitDown?: boolean;
	/** A place source failed; the list was built from cached data for (part of) the area. */
	placesPartial?: boolean;
}

export interface SearchPage {
	poolId: string;
	total: number;
	/** Where the next page starts in the stored list. */
	offset: number;
	more: boolean;
	/** Some bus/train trips on this page didn't come back in time; ask again for the same page. */
	pending: boolean;
	hidden: Hidden;
	venues: Venue[];
}

/** Answer to a fill-in: the same places, with real bus/train trips, plus the ones that failed. */
export interface FillIn extends SearchPage {
	blocker: Blocker | null;
	transitDown?: boolean;
	dropped: { id: string; why: DropReason; who: number }[];
	/** First fill-in only: row `from` had no trip at all and now shows `venue` (faded with `why` if that failed too). */
	replaced?: { from: string; venue: Venue; why?: DropReason; who?: number }[];
	/** First fill-in only: row `from` now shows `venue`, a hidden candidate with real times and a smaller gap. */
	swapped?: { from: string; venue: Venue }[];
	/** This answer ends the first fill-in: re-sort the rows on screen once, then never again. */
	final?: boolean;
	/** With `final`: the visible rows after the one re-sort, in order (fairest real times first). */
	order?: Venue[];
}

/** Where the on-screen fill-in is: trips to the meeting, then rides home, then done. Client-side only. */
/** 'rank' runs once on a new search, between 'out' and 'home': hidden candidates checked, then the one re-sort. */
export type FillStage = 'out' | 'rank' | 'home' | 'done';

/** `firstOut`: the first fill-in of this search hasn't run yet (the only pass that may replace no-trip rows). */
/** `batchStart`: index of the first row of the latest "Show 5 more" batch (that batch is sorted among itself). */
export type SearchResult = SearchPage & SearchMeta & { fill?: FillStage; firstOut?: boolean; batchStart?: number };

export type SearchErrorKind = 'busy' | 'places' | 'expired' | 'failed';

export class SearchError extends Error {
	constructor(public kind: SearchErrorKind) {
		super(kind);
	}
}

export interface SearchOptions {
	radiusScale: 1 | 1.6 | 2.56;
	capBonus: 0 | 30;
}

export const WIDER: Record<number, SearchOptions['radiusScale'] | null> = { 1: 1.6, 1.6: 2.56, 2.56: null };

const RETRY_STATUS = new Set([502, 503, 504]);

async function callSearch<T>(body: Record<string, unknown>): Promise<T> {
	const client = supabase;
	if (!client) throw new SearchError('failed');
	// Coordinates travel in the POST body only, never in a URL.
	const once = async () => {
		const { data, error } = await client.functions.invoke('search', { body });
		const status = error ? (error instanceof FunctionsHttpError ? (error.context as Response).status : 0) : 200;
		return { data, error, status };
	};
	let r = await once();
	// One automatic retry for a gateway/unavailable answer (502, 503, 504) only, before the error screen.
	if (r.error && RETRY_STATUS.has(r.status)) {
		await new Promise((go) => setTimeout(go, 1500));
		r = await once();
	}
	if (r.error) {
		const status = r.status;
		throw new SearchError(status === 429 ? 'busy' : status === 503 ? 'places' : status === 410 ? 'expired' : 'failed');
	}
	return r.data as T;
}

/** Place name in the current UI language (no new search on EN/HE switch). Falls back to what the search returned. */
export function venueNames(v: Venue, lang: Lang): { name: string; altName?: string } {
	if (!v.ln) return { name: v.name, altName: v.altName };
	const local = v.ln.alt ?? v.ln.base;
	const name = (lang === 'he' ? v.ln.he : v.ln.en) ?? v.ln.base;
	return { name, altName: name !== local ? local : v.ln.alt };
}
export { buildRequest, fairCmp, fairSort, finalSort } from '@/lib/ranking';

export function runSearch(req: ReturnType<typeof buildRequest>) {
	return callSearch<SearchResult>({ action: 'search', ...req });
}

/**
 * A page from the stored list, starting at `offset`: the next 5 on Load more, or the same page again to finish
 * bus/train trips that were still pending. Starting points travel again in the POST body (they are never stored
 * at full precision) so the trips can be planned.
 */
export function loadMore(poolId: string, offset: number, people: ReturnType<typeof buildRequest>['people'], lang: Lang) {
	return callSearch<SearchPage>({ action: 'more', poolId, offset, people, lang });
}

/** Real bus/train trips for places already on screen. Never adds, replaces or reorders places. */
export type FillPhase = 'out' | 'rank' | 'home' | 'row' | 'tap';

/**
 * Bus/train trips for places already on screen, in passes: 'out' (trips to the meeting), then 'home' (rides home,
 * only for riders whose trip there is real), or 'row' ("Check again" on one place). Not counted as a new search.
 */
export function fillIn(
	poolId: string,
	offset: number,
	people: ReturnType<typeof buildRequest>['people'],
	ids: string[],
	phase: FillPhase,
	lang: Lang,
	/** First fill-in of a search only: no-trip rows get replaced, and the rows are re-sorted once at the end. */
	replace = false,
	/** With 'out': also do the one re-sort in the same answer (staged first fill-in, no hidden pass). */
	rank = false,
	/** With 'out': also plan this many more places from the list (hidden pass), returned in `venues`. */
	extra = 0,
) {
	return callSearch<FillIn>({
		action: 'more',
		poolId,
		offset,
		people,
		ids,
		phase,
		lang,
		...(replace ? { replace: true } : {}),
		...(rank ? { rank: true, hidden: false } : {}),
		...(extra > 0 ? { extra } : {}),
	});
}

/** A rider whose trip to the meeting is real but whose ride home hasn't come back (yet). */
export const homeOpen = (p: PerPerson) => p.mode === 'transit' && !p.estimate && Boolean(p.out) && p.ride !== 'ok' && p.ride !== 'none';

/** A bus/train time that is still the rough first pass (no real trip yet). Its "leave by" must not be shown. */
export const roughTransit = (p: PerPerson) => p.mode === 'transit' && p.estimate;

/**
 * What a share link or preview image may use (M5): only the filled-in results, never the first rough pass.
 * Returns null while bus/train trips are still being filled in; faded (dropped) places are left out.
 * A place whose ride home couldn't be checked (`homeOpen`) is still shareable; the share card must say
 * "bus home not checked" for it.
 */
export function shareableVenues(r: SearchResult): Venue[] | null {
	if (r.pending || (r.fill && r.fill !== 'done')) return null;
	return r.venues.filter((v) => !v.dropped);
}

/** True when a shared place must carry the "bus home not checked" note on the share card. */
export const shareHomeUnchecked = (v: Venue) => v.per.some(homeOpen);

/** Deep links (spec M2). Venue coordinates only; starting points are never put in links. */
export function venueLinks(v: Venue) {
	const ll = `${v.lat},${v.lon}`;
	return {
		waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
		google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
		moovit: `https://moovitapp.com/?to=${encodeURIComponent(v.name)}&tll=${v.lat}_${v.lon}`,
	};
}
