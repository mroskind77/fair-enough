// Place suggestions: duplicate grouping and "wrong place" checks (RULES.md, Suggestions). Pure, no network.
// Used by the geo function (copied in by scripts/sync-shared.mjs) and by the tests in /tests.

export interface SuggestionLike {
	id: string;
	label: string;
	sublabel?: string;
	lat: number;
	lon: number;
}

/** Centres of the cities the app knows by name (the 20 largest). Matched on the normalised name. */
export interface KnownCity {
	names: string[];
	lat: number;
	lon: number;
}

/** A place whose name or address claims a known city more than this far from that city's centre is wrong. */
export const CITY_MATCH_KM = 12;
/** Same name within this distance is one place. */
export const SAME_PLACE_KM = 3;

export const kmBetween = (aLat: number, aLon: number, bLat: number, bLon: number) => {
	const r = Math.PI / 180;
	const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
	const y = (bLat - aLat) * r;
	return Math.sqrt(x * x + y * y) * 6371;
};

export const normName = (t: string) =>
	t
		.toLowerCase()
		.replace(/[\u05be\u2010-\u2015\-_'’"`׳״.]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const isPostcode = (p: string) => /^\d{5,7}$/.test(p.trim());
/** Address parts without postcodes, districts or the country. */
const addressParts = (s: SuggestionLike) =>
	(s.sublabel ?? '')
		.split(',')
		.map((p) => p.replace(/\b\d{5,7}\b/g, '').trim())
		.filter((p) => p && !/^(israel|ישראל)$/i.test(p) && !/\b(Sub)?district\b/i.test(p) && !/^(נפת|מחוז) /.test(p));

/** How complete the address is: named parts, plus one for a postcode and one for a house number. */
export function completeness(s: SuggestionLike): number {
	const parts = (s.sublabel ?? '').split(',').map((p) => p.trim());
	return addressParts(s).length + (parts.some((p) => isPostcode(p) || /\b\d{7}\b/.test(p)) ? 1 : 0) + (/\d/.test(s.label) ? 1 : 0);
}

/** 2: the name is exactly the query, 1: the name starts with it, 0: otherwise. */
export function nameMatch(s: SuggestionLike, q: string): number {
	const n = normName(s.label);
	const k = normName(q);
	return n === k ? 2 : n.startsWith(k) ? 1 : 0;
}

/**
 * True when the place's name or a part of its address names a known city whose centre is more than CITY_MATCH_KM
 * away: the postcode/city text and the coordinates disagree (e.g. a street called "Modiin" in Herzliya labelled as
 * the city Modi'in-Maccabim-Re'ut).
 */
export function cityMismatch(s: SuggestionLike, cities: KnownCity[], rawLabel = s.label): boolean {
	const claims = [rawLabel, s.label, ...addressParts(s)];
	for (const c of claims) {
		const k = normName(c);
		const city = cities.find((x) => x.names.some((n) => normName(n) === k));
		if (city && kmBetween(s.lat, s.lon, city.lat, city.lon) > CITY_MATCH_KM) return true;
	}
	return false;
}

/**
 * Same name (normalised) within SAME_PLACE_KM is one suggestion: keeps the best name match, then the most complete
 * address, then the first. Order of the kept ones follows the first copy of each group.
 */
export function groupSameName<T extends SuggestionLike>(list: T[], q: string): T[] {
	const groups: { key: string; at: number; best: T; all: T[] }[] = [];
	list.forEach((s, at) => {
		const key = normName(s.label);
		const g = groups.find((x) => x.key === key && x.all.some((o) => kmBetween(o.lat, o.lon, s.lat, s.lon) <= SAME_PLACE_KM));
		if (!g) return void groups.push({ key, at, best: s, all: [s] });
		g.all.push(s);
		const better = nameMatch(s, q) - nameMatch(g.best, q) || completeness(s) - completeness(g.best);
		if (better > 0) g.best = s;
	});
	return groups.sort((a, b) => a.at - b.at).map((g) => g.best);
}

/** Drops wrong-city entries, then groups same-name copies. `raw` gives each entry's label before renaming. */
export function cleanSuggestions<T extends SuggestionLike>(list: T[], q: string, cities: KnownCity[], raw?: (s: T) => string): T[] {
	return groupSameName(
		list.filter((s) => !cityMismatch(s, cities, raw ? raw(s) : s.label)),
		q,
	);
}
