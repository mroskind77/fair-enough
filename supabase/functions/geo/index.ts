// Fair Enough — geo: address autocomplete (suggest) and point → area name (reverse).
// Deno runtime. Inputs come from the POST body only; nothing personal is logged.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
// ───── shared:suggest — generated from _shared/suggest.ts, edit there and run scripts/sync-shared.mjs ─────
// Place suggestions: duplicate grouping and "wrong place" checks (RULES.md, Suggestions). Pure, no network.
// Used by the geo function (copied in by scripts/sync-shared.mjs) and by the tests in /tests.

interface SuggestionLike {
	id: string;
	label: string;
	sublabel?: string;
	lat: number;
	lon: number;
}

/** Centres of the cities the app knows by name (the 20 largest). Matched on the normalised name. */
interface KnownCity {
	names: string[];
	lat: number;
	lon: number;
}

/** A place whose name or address claims a known city more than this far from that city's centre is wrong. */
const CITY_MATCH_KM = 12;
/** Same name within this distance is one place. */
const SAME_PLACE_KM = 3;

const kmBetween = (aLat: number, aLon: number, bLat: number, bLon: number) => {
	const r = Math.PI / 180;
	const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
	const y = (bLat - aLat) * r;
	return Math.sqrt(x * x + y * y) * 6371;
};

const normName = (t: string) =>
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
function completeness(s: SuggestionLike): number {
	const parts = (s.sublabel ?? '').split(',').map((p) => p.trim());
	return addressParts(s).length + (parts.some((p) => isPostcode(p) || /\b\d{7}\b/.test(p)) ? 1 : 0) + (/\d/.test(s.label) ? 1 : 0);
}

/** 2: the name is exactly the query, 1: the name starts with it, 0: otherwise. */
function nameMatch(s: SuggestionLike, q: string): number {
	const n = normName(s.label);
	const k = normName(q);
	return n === k ? 2 : n.startsWith(k) ? 1 : 0;
}

/**
 * True when the place's name or a part of its address names a known city whose centre is more than CITY_MATCH_KM
 * away: the postcode/city text and the coordinates disagree (e.g. a street called "Modiin" in Herzliya labelled as
 * the city Modi'in-Maccabim-Re'ut).
 */
function cityMismatch(s: SuggestionLike, cities: KnownCity[], rawLabel = s.label): boolean {
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
function groupSameName<T extends SuggestionLike>(list: T[], q: string): T[] {
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
function cleanSuggestions<T extends SuggestionLike>(list: T[], q: string, cities: KnownCity[], raw?: (s: T) => string): T[] {
	return groupSameName(
		list.filter((s) => !cityMismatch(s, cities, raw ? raw(s) : s.label)),
		q,
	);
}
// ───── end shared:suggest ─────
// ───── shared:transitous — generated from _shared/transitous.ts, edit there and run scripts/sync-shared.mjs ─────
// Fair Enough — everything about how we talk to Transitous (https://transitous.org/api/), in one place.
// Usage rules: only the public endpoint below, a User-Agent with app name, version and contact, a visible link to
// https://transitous.org/sources/, and staying light on their resources (well under 720 /plan-type calls a day).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';

/** Bump on every release. Sent in the User-Agent of every server-side call. */
export const APP_VERSION = '1.1.0';

/**
 * The only Transitous address the app may use. Never the staging instance or the servers behind the load
 * balancer: the usage rules forbid applications from using those.
 */
export const TRANSITOUS_API = 'https://api.transitous.org/api/';

export const USER_AGENT = `FairEnough/${APP_VERSION} (+https://fairenough.sticklight.app; miriamroskind@gmail.com)`;
export const TRANSITOUS_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

/** Real Transitous calls a day (UTC day), across all searches. Cache hits don't count. */
export const TRANSIT_DAILY_CAP = 650;
export const TRANSIT_DAY_COUNTER = 'search:upstream:transitous';

/** Full URL for an API path such as `v5/plan`. Always under TRANSITOUS_API. */
export function transitousUrl(path: string, params: Record<string, string | number | boolean>): string {
	const u = new URL(path.replace(/^\/+/, ''), TRANSITOUS_API);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
	return u.href.replace(/%2C/g, ',').replace(/%3A/g, ':');
}

export type CallOutcome =
	| 'ok'
	| 'hit' // answered from our 6-hour trip cache: no call
	| 'shared' // same lookup already running in this search: no extra call
	| 'dropped' // waited too long in our own queue: no call
	| 'skip' // the 15-minute skip was on: no call
	| 'cap' // daily allowance used up: no call
	| 'timeout'
	| 'refused'
	| 'dns'
	| 'tls'
	| 'network'
	| '4xx'
	| '429'
	| '5xx';

/** Outcomes where a request really went to Transitous. */
export const REAL_CALL: CallOutcome[] = ['ok', 'timeout', 'refused', 'dns', 'tls', 'network', '4xx', '429', '5xx'];

/** Names the failure: an HTTP status if there was one, otherwise the kind of network error. */
export function classify(e: unknown, status?: number): CallOutcome {
	if (status !== undefined) {
		if (status === 429) return '429';
		if (status >= 500) return '5xx';
		if (status >= 400) return '4xx';
	}
	if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'timeout';
	const msg = e instanceof Error ? `${e.name} ${e.message}`.toLowerCase() : '';
	if (/refused|os error 111|econnrefused/.test(msg)) return 'refused';
	if (/dns|lookup address|name or service|no such host|getaddrinfo|enotfound/.test(msg)) return 'dns';
	if (/tls|ssl|certificate|handshake/.test(msg)) return 'tls';
	return 'network';
}

export interface CallLog {
	sid?: string | null;
	endpoint: string;
	outcome: CallOutcome;
	status?: number | null;
	ms?: number | null;
	bytes?: number | null;
}

/** One row per lookup, for the diagnostic. Never contains coordinates or anything about who searched. */
export function logCall(db: SupabaseClient, c: CallLog): Promise<unknown> {
	if (Math.random() < 0.01) {
		// Occasional sweep: keep two weeks of log.
		void Promise.resolve(db.from('transit_call').delete().lt('at', new Date(Date.now() - 14 * 86400_000).toISOString())).catch(() => undefined);
	}
	return Promise.resolve(
		db.from('transit_call').insert({
			sid: c.sid ?? null,
			endpoint: c.endpoint,
			outcome: c.outcome,
			status: c.status ?? null,
			ms: c.ms ?? null,
			bytes: c.bytes ?? null,
		}),
	).catch(() => undefined);
}
// ───── end shared:transitous ─────

// ───────────────────────── guard v1 (identical in every function) ─────────────────────────
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*sticklight\.(app|com|io|dev)|http:\/\/localhost(:\d+)?)$/i;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
	auth: { persistSession: false },
});

function corsHeaders(origin: string | null): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': origin && ALLOWED_ORIGIN.test(origin) ? origin : 'https://fairenough.sticklight.app',
		'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		Vary: 'Origin',
	};
}

function json(body: unknown, status: number, cors: Record<string, string>, extra: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}

function clientIp(req: Request): string {
	// Platform-set header first; first hop of x-forwarded-for as fallback (see M0 probe results).
	return (
		req.headers.get('cf-connecting-ip') ??
		req.headers.get('x-real-ip') ??
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		'unknown'
	);
}

async function ipHash(req: Request): Promise<string> {
	// Daily salt: the hash changes every day; raw IPs are never stored.
	const secret = Deno.env.get('IP_HASH_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const day = new Date().toISOString().slice(0, 10);
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${secret}:${day}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(clientIp(req)));
	return Array.from(new Uint8Array(sig).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Atomic counter. Fails closed if the counter itself errors. */
async function bump(key: string, windowSeconds: number, limit: number): Promise<boolean> {
	const { data, error } = await db.rpc('bump', { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
	if (error) return false;
	return data === true;
}

interface Limit {
	scope: 'ip' | 'global';
	window: number;
	max: number;
}

async function checkLimits(fn: string, action: string, ip: string, limits: Limit[]): Promise<boolean> {
	for (const l of limits) {
		const key = `${fn}:${action}:${l.scope === 'ip' ? ip : 'all'}:${l.window}`;
		if (!(await bump(key, l.window, l.max))) return false;
	}
	return true;
}

async function sha(text: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(d).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function cacheGet<T>(key: string): Promise<T | null> {
	const { data } = await db.from('cache').select('json, fetched_at, ttl_seconds').eq('key', key).maybeSingle();
	if (!data) return null;
	if (new Date(data.fetched_at).getTime() + data.ttl_seconds * 1000 < Date.now()) return null;
	return data.json as T;
}

async function cachePut(key: string, value: unknown, ttlSeconds: number) {
	await db.from('cache').upsert({ key, json: value, fetched_at: new Date().toISOString(), ttl_seconds: ttlSeconds });
	if (Math.random() < 0.01) {
		// Occasional sweep of long-expired entries (max TTL is 30 days).
		await db.from('cache').delete().lt('fetched_at', new Date(Date.now() - 31 * 86400_000).toISOString());
	}
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}
// ─────────────────────────────────────── end guard v1 ───────────────────────────────────────

type Lang = 'he' | 'en';

interface Suggestion {
	id: string;
	label: string;
	sublabel?: string;
	lat: number;
	lon: number;
}

// Israel incl. Golan and Eilat, a little generous; results are also filtered by country.
const BBOX = { minLon: 34.2, minLat: 29.45, maxLon: 35.95, maxLat: 33.35 };
const inIsrael = (lat: number, lon: number) =>
	lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;

// Official names for the 20 largest cities, in English and Hebrew. Provider spellings ("Tel-Aviv", "Petah Tiqva",
// "תל אביב") are matched after normalising, and only whole comma-separated name parts are replaced, so
// "Tel Aviv University" or "Lev Tel Aviv" stay as they are.
const CITIES: { en: string; he: string; alt: string[]; lat: number; lon: number }[] = [
	{ en: 'Tel Aviv-Yafo', he: 'תל אביב-יפו', alt: ['Tel Aviv', 'Tel-Aviv', 'Tel Aviv Jaffa', 'Tel Aviv-Jaffa', 'תל אביב', 'תל־אביב'], lat: 32.0853, lon: 34.7818 },
	{ en: 'Jerusalem', he: 'ירושלים', alt: ['Yerushalayim'], lat: 31.7683, lon: 35.2137 },
	{ en: 'Haifa', he: 'חיפה', alt: ['Hefa'], lat: 32.794, lon: 34.9896 },
	{ en: 'Rishon LeZion', he: 'ראשון לציון', alt: ['Rishon LeTsiyyon', 'Rishon Lezion', 'Rishon Le Zion', 'Rishon LeTsiyon'], lat: 31.973, lon: 34.7925 },
	{ en: 'Petah Tikva', he: 'פתח תקווה', alt: ['Petah Tiqva', 'Petach Tikva', 'Petah Tiqwa', 'Petakh Tikva', 'פתח תקוה'], lat: 32.084, lon: 34.8878 },
	{ en: 'Ashdod', he: 'אשדוד', alt: [], lat: 31.8014, lon: 34.6435 },
	{ en: 'Netanya', he: 'נתניה', alt: ['Natanya'], lat: 32.3215, lon: 34.8532 },
	{ en: "Be'er Sheva", he: 'באר שבע', alt: ['Beer Sheva', 'Beersheba', "Be'er Sheba", 'Beersheva'], lat: 31.2518, lon: 34.7913 },
	{ en: 'Bnei Brak', he: 'בני ברק', alt: ['Bene Beraq', 'Bnei Berak'], lat: 32.0807, lon: 34.8338 },
	{ en: 'Holon', he: 'חולון', alt: [], lat: 32.0158, lon: 34.7874 },
	{ en: 'Ramat Gan', he: 'רמת גן', alt: [], lat: 32.0684, lon: 34.8248 },
	{ en: 'Rehovot', he: 'רחובות', alt: ['Rehovoth'], lat: 31.8928, lon: 34.8113 },
	{ en: 'Ashkelon', he: 'אשקלון', alt: ['Ashqelon'], lat: 31.6688, lon: 34.5743 },
	{ en: 'Bat Yam', he: 'בת ים', alt: [], lat: 32.0171, lon: 34.7454 },
	{ en: 'Beit Shemesh', he: 'בית שמש', alt: ['Bet Shemesh'], lat: 31.747, lon: 34.9881 },
	{ en: 'Kfar Saba', he: 'כפר סבא', alt: ['Kefar Sava', 'Kfar Sava'], lat: 32.175, lon: 34.9069 },
	{ en: 'Herzliya', he: 'הרצליה', alt: ['Herzliyya', 'Herzlia'], lat: 32.1663, lon: 34.8434 },
	{ en: 'Hadera', he: 'חדרה', alt: [], lat: 32.434, lon: 34.9196 },
	{ en: "Modi'in-Maccabim-Re'ut", he: 'מודיעין-מכבים-רעות', alt: ["Modi'in", 'Modiin', 'Modiin Maccabim Reut', 'מודיעין', 'מודיעין מכבים רעות'], lat: 31.898, lon: 35.0104 },
	{ en: 'Nazareth', he: 'נצרת', alt: ['Nazerat', 'Natzrat'], lat: 32.6996, lon: 35.3035 },
];
/** Lowercase, no punctuation, one space: "Tel-Aviv–Yafo" and "tel aviv yafo" compare equal. */
const norm = (t: string) =>
	t
		.toLowerCase()
		.replace(/[\u05be\u2010-\u2015\-_'’"`׳״.]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
const KNOWN_CITIES: KnownCity[] = CITIES.map((c) => ({ names: [c.en, c.he, ...c.alt], lat: c.lat, lon: c.lon }));
const CITY_BY_NAME = new Map<string, (typeof CITIES)[number]>();
for (const c of CITIES) for (const n of [c.en, c.he, ...c.alt]) CITY_BY_NAME.set(norm(n), c);
const isHebrew = (t: string) => /[\u0590-\u05ff]/.test(t);
const cityOf = (part: string) => CITY_BY_NAME.get(norm(part));
const officialName = (part: string, lang: Lang) => {
	const c = cityOf(part);
	if (!c) return part;
	// Keep the script the provider used, so a Hebrew label isn't half English.
	return isHebrew(part) ? c.he : lang === 'he' && !/[a-z]/i.test(part) ? c.he : c.en;
};
const DISTRICT = /\s*\b(Sub)?district\b\s*|^(נפת|מחוז)\s+/gi;
const isDistrict = (t: string) => /\b(Sub)?district\b/i.test(t) || /^(נפת|מחוז) /.test(t);

/** Fixes city names and drops a district that repeats the city ("Tel Aviv-Yafo, Tel Aviv District"). */
function cleanParts(label: string, sublabel: string | undefined, lang: Lang) {
	const l = officialName(label, lang);
	const parts = (sublabel ?? '').split(', ').filter(Boolean).map((p) => officialName(p, lang));
	const kept = parts.filter((p) => {
		if (!isDistrict(p)) return true;
		const core = norm(p.replace(DISTRICT, ' '));
		const city = cityOf(core);
		const others = norm([l, ...parts.filter((x) => x !== p)].join(' '));
		return !(core && (others.includes(core) || (city && others.includes(norm(city.en))) || (city && others.includes(norm(city.he)))));
	});
	return { label: l, sublabel: kept.length ? kept.join(', ') : undefined };
}

const fixNames = (t: string | undefined, lang: Lang) => t?.split(', ').map((p) => officialName(p, lang)).join(', ');

// Whole districts are no use as a starting point.
const isRegion = (label: string) => /\b(Sub)?district\b/i.test(label) || /^(נפת|מחוז) /.test(label);

/** 2: the result is a city named in the query. 1: it lies in a city named in the query. 0: neither. */
function cityRank(s: Suggestion, qNorm: string): number {
	const named = (part: string) => {
		const c = cityOf(part);
		const names = c ? [c.en, c.he, ...c.alt] : [part];
		return names.some((n) => {
			const k = norm(n);
			return k.length >= 2 && (` ${qNorm} `).includes(` ${k} `);
		});
	};
	if (cityOf(s.label) && named(s.label)) return 2;
	const parts = (s.sublabel ?? '').split(', ').filter(Boolean);
	return parts.some((p) => !isDistrict(p) && named(p)) ? 1 : 0;
}

const dedupe = (list: Suggestion[], q: string, lang: Lang) => {
	const seen = new Set<string>();
	const qNorm = norm(q);
	const inArea = list.filter((s) => inIsrael(s.lat, s.lon));
	// Wrong place: its name or address names a known city far from its coordinates (checked on the provider's own
	// label, before city names are tidied). Then same name within 3 km is one suggestion (best match, fullest address).
	const rawLabel = new Map(inArea.map((s) => [s.id, s.label]));
	const cleaned = inArea.map((s) => ({ ...s, ...cleanParts(s.label, s.sublabel, lang) })).filter((s) => !isRegion(s.label));
	return cleanSuggestions(cleaned, q, KNOWN_CITIES, (s) => rawLabel.get(s.id) ?? s.label)
		.filter((s) => {
			// Same name at the same spot (e.g. "Tel-Aviv" and "Tel Aviv" for one city) is one suggestion.
			const k = `${s.label}|${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.map((s, i) => ({ s, i, r: cityRank(s, qNorm) }))
		// Results in a city the query names come first; otherwise keep the provider's order.
		.sort((a, b) => b.r - a.r || a.i - b.i)
		.map((x) => x.s)
		.slice(0, 6);
};

const join = (...parts: (string | undefined | null)[]) => parts.filter(Boolean).join(', ') || undefined;

interface Provider {
	name: string;
	dailyCap: number;
	enabled: () => boolean;
	suggest: (q: string, lang: Lang) => Promise<Suggestion[]>;
}

// Photon refuses requests from cloud servers (403 in the M0 probe), so it is tried last.
const PROVIDERS: Provider[] = [
	{
		name: 'geoapify',
		dailyCap: 2500,
		enabled: () => Boolean(Deno.env.get('GEOAPIFY_KEY')),
		async suggest(q, lang) {
			const params = new URLSearchParams({ text: q, filter: 'countrycode:il,ps', lang, limit: '6', format: 'json', apiKey: Deno.env.get('GEOAPIFY_KEY')! });
			const data = (await fetchJson(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, 2000)) as {
				results: { place_id: string; name?: string; address_line1: string; address_line2?: string; lat: number; lon: number }[];
			};
			return data.results.map((r) => ({ id: `geoapify:${r.place_id}`, label: r.address_line1, sublabel: r.address_line2, lat: r.lat, lon: r.lon }));
		},
	},
	{
		name: 'locationiq',
		dailyCap: 4000,
		enabled: () => Boolean(Deno.env.get('LOCATIONIQ_KEY')),
		async suggest(q, lang) {
			const params = new URLSearchParams({ key: Deno.env.get('LOCATIONIQ_KEY')!, q, countrycodes: 'il,ps', limit: '6', 'accept-language': lang, normalizecity: '1' });
			const data = (await fetchJson(`https://api.locationiq.com/v1/autocomplete?${params}`, 2000)) as {
				place_id: string; display_place: string; display_address?: string; lat: string; lon: string;
			}[];
			return data.map((r) => ({ id: `liq:${r.place_id}`, label: r.display_place, sublabel: r.display_address, lat: Number(r.lat), lon: Number(r.lon) }));
		},
	},
	{
		name: 'heigit',
		dailyCap: 900,
		enabled: () => Boolean(Deno.env.get('HEIGIT_KEY')),
		async suggest(q, lang) {
			const params = new URLSearchParams({ api_key: Deno.env.get('HEIGIT_KEY')!, text: q, 'boundary.country': 'ISR,PSE', lang, size: '6' });
			const data = (await fetchJson(`https://api.heigit.org/pelias/v1/autocomplete?${params}`, 2000)) as {
				features: { geometry: { coordinates: [number, number] }; properties: { gid: string; name: string; locality?: string; region?: string } }[];
			};
			return data.features.map((f) => ({
				id: `heigit:${f.properties.gid}`,
				label: f.properties.name,
				sublabel: join(f.properties.locality, f.properties.region),
				lat: f.geometry.coordinates[1],
				lon: f.geometry.coordinates[0],
			}));
		},
	},
	{
		name: 'photon',
		dailyCap: 3000,
		enabled: () => true,
		async suggest(q, lang) {
			// Photon has no Hebrew UI language; the default returns local (Hebrew) names.
			const params = new URLSearchParams({ q, limit: '10', bbox: `${BBOX.minLon},${BBOX.minLat},${BBOX.maxLon},${BBOX.maxLat}` });
			if (lang === 'en') params.set('lang', 'en');
			const data = (await fetchJson(`https://photon.komoot.io/api?${params}`, 2000)) as {
				features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number> }[];
			};
			return data.features
				.filter((f) => ['IL', 'PS'].includes(String(f.properties.countrycode ?? '')))
				.map((f) => {
					const p = f.properties;
					const street = p.street ? join(String(p.street), p.housenumber ? String(p.housenumber) : undefined)?.replace(', ', ' ') : undefined;
					const label = String(p.name ?? street ?? p.city ?? '');
					return {
						id: `photon:${p.osm_type}${p.osm_id}`,
						label,
						sublabel: join(p.name && street ? street : undefined, p.district as string, p.city as string ?? p.county as string),
						lat: f.geometry.coordinates[1],
						lon: f.geometry.coordinates[0],
					};
				})
				.filter((s) => s.label);
		},
	},
];

// ───────────────────────────── street + house number ─────────────────────────────
// "Arlozorov Street 100, Tel Aviv", "Derech Arlozorov 100", "ארלוזורוב 100 תל אביב": split into street, number and
// city, then ask the geocoders with structured fields (Geoapify, then LocationIQ; both free tiers). If neither
// knows the number, the street's centre is offered, labelled "(no exact number)". Israel only, cached 24 h.
interface AddrQuery {
	street: string;
	/** Same street with a "Derech"/"דרך" prefix kept, tried when the bare name finds nothing. */
	streetAlt?: string;
	number: string;
	city?: string;
}

const STREET_PREFIX = /^(rehov|rechov|rehob|street|st\.?|רחוב|רח['׳]?)\s+/i;
const STREET_SUFFIX = /\s+(street|st\.?|road|rd\.?)$/i;
const DERECH = /^(derech|dereh|דרך)\s+/i;
const HOUSE_NO = /^\d{1,4}[a-zא-ת]?$/i;

export function parseAddress(q: string): AddrQuery | null {
	let rest = q.trim();
	let city: string | undefined;
	const parts = rest.split(',').map((x) => x.trim()).filter(Boolean);
	if (parts.length >= 2) {
		city = parts.slice(1).join(', ');
		rest = parts[0];
	}
	let tokens = rest.split(/\s+/);
	if (!city) {
		// A known city at the end without a comma: "ארלוזורוב 100 תל אביב".
		for (let k = Math.min(4, tokens.length - 1); k >= 1; k--) {
			const tail = tokens.slice(-k).join(' ');
			if (cityOf(tail)) {
				city = tail;
				tokens = tokens.slice(0, -k);
				break;
			}
		}
	}
	const ni = tokens.findIndex((tk) => HOUSE_NO.test(tk));
	if (ni < 0) return null;
	const number = tokens[ni];
	let street = tokens.filter((_, i) => i !== ni).join(' ').trim();
	street = street.replace(STREET_PREFIX, '').replace(STREET_SUFFIX, '').trim();
	if (street.length < 2 || /^\d+$/.test(street)) return null;
	const bare = street.replace(DERECH, '').trim();
	return { street: bare || street, streetAlt: bare && bare !== street ? street : undefined, number, city };
}

/** The result lies in the city the person typed (or no city was typed). */
function cityMatches(wanted: string | undefined, got: string | undefined): boolean {
	if (!wanted) return true;
	if (!got) return false;
	const a = cityOf(wanted);
	const b = cityOf(got);
	if (a || b) return a === b;
	const nw = norm(wanted);
	const ng = norm(got);
	return ng.includes(nw) || nw.includes(ng);
}

/** Position in the big-cities list (Tel Aviv-Yafo first); other places after. */
const cityOrder = (c: string | undefined) => {
	const x = c ? cityOf(c) : undefined;
	return x ? CITIES.indexOf(x) : CITIES.length;
};

/** "Arlozorov Street" → "Arlozorov St (no exact number)"; Hebrew "ארלוזורוב (בלי מספר בית מדויק)". */
function streetOnlyLabel(name: string, lang: Lang): string {
	if (lang === 'he' || isHebrew(name)) return `${name} (בלי מספר בית מדויק)`;
	const st = /\bstreet$/i.test(name) ? name.replace(/\bstreet$/i, 'St') : /\b(st|road|rd|avenue|ave|boulevard|blvd)\.?$/i.test(name) || /^(derech|sderot|shderot)\b/i.test(name) ? name : `${name} St`;
	return `${st} (no exact number)`;
}

interface AddrHit {
	exact: boolean;
	street: string;
	number?: string;
	city?: string;
	lat: number;
	lon: number;
	id: string;
}

async function geoapifyAddress(a: AddrQuery, street: string, withNumber: boolean, lang: Lang): Promise<AddrHit[]> {
	const params = new URLSearchParams({ street, filter: 'countrycode:il', lang, limit: '5', format: 'json', apiKey: Deno.env.get('GEOAPIFY_KEY')! });
	if (withNumber) params.set('housenumber', a.number);
	if (a.city) params.set('city', a.city);
	params.set('country', 'Israel');
	const data = (await fetchJson(`https://api.geoapify.com/v1/geocode/search?${params}`, 2500)) as {
		results?: { place_id: string; result_type?: string; housenumber?: string; street?: string; city?: string; lat: number; lon: number }[];
	};
	return (data.results ?? [])
		.filter((r) => r.street && (r.result_type === 'building' || r.result_type === 'street'))
		.map((r) => ({
			exact: Boolean(withNumber && r.housenumber && norm(r.housenumber) === norm(a.number)),
			street: r.street!,
			number: r.housenumber,
			city: r.city,
			lat: r.lat,
			lon: r.lon,
			id: `geoapify:${r.place_id}`,
		}));
}

async function locationiqAddress(a: AddrQuery, street: string, withNumber: boolean, lang: Lang): Promise<AddrHit[]> {
	const params = new URLSearchParams({
		key: Deno.env.get('LOCATIONIQ_KEY')!,
		street: withNumber ? `${a.number} ${street}` : street,
		countrycodes: 'il',
		format: 'json',
		addressdetails: '1',
		normalizecity: '1',
		limit: '5',
		'accept-language': lang,
	});
	if (a.city) params.set('city', a.city);
	const data = (await fetchJson(`https://us1.locationiq.com/v1/search?${params}`, 2500)) as {
		place_id: string;
		lat: string;
		lon: string;
		address?: { house_number?: string; road?: string; city?: string; town?: string; village?: string };
	}[];
	return (Array.isArray(data) ? data : [])
		.filter((r) => r.address?.road)
		.map((r) => ({
			exact: Boolean(withNumber && r.address?.house_number && norm(r.address.house_number) === norm(a.number)),
			street: r.address!.road!,
			number: r.address?.house_number,
			city: r.address?.city ?? r.address?.town ?? r.address?.village,
			lat: Number(r.lat),
			lon: Number(r.lon),
			id: `liq:${r.place_id}`,
		}));
}

const ADDR_SOURCES: { name: 'geoapify' | 'locationiq'; cap: number; key: string; run: typeof geoapifyAddress }[] = [
	{ name: 'geoapify', cap: 2500, key: 'GEOAPIFY_KEY', run: geoapifyAddress },
	{ name: 'locationiq', cap: 4000, key: 'LOCATIONIQ_KEY', run: locationiqAddress },
];

/** Structured street + number lookup. Exact number first; otherwise the street's centre. */
async function addressSuggest(a: AddrQuery, lang: Lang): Promise<{ provider: string; results: Suggestion[] } | null> {
	const key = `addr1:${lang}:${await sha(JSON.stringify(a).toLowerCase())}`;
	const cached = await cacheGet<{ provider: string; results: Suggestion[] }>(key);
	if (cached) return cached.results.length ? cached : null;
	const usable = (h: AddrHit) => inIsrael(h.lat, h.lon) && cityMatches(a.city, h.city);
	const toSuggestion = (h: AddrHit, exact: boolean): Suggestion => ({
		id: `${h.id}:${exact ? a.number : 'street'}`,
		label: exact ? `${h.street} ${h.number ?? a.number}` : streetOnlyLabel(h.street, lang),
		sublabel: h.city ? officialName(h.city, lang) : undefined,
		lat: h.lat,
		lon: h.lon,
	});
	const streets = [a.street, ...(a.streetAlt ? [a.streetAlt] : [])];
	let streetOnly: { provider: string; hit: AddrHit } | null = null;
	for (const src of ADDR_SOURCES) {
		if (!Deno.env.get(src.key)) continue;
		for (const street of streets) {
			if (!(await bump(`geo:provider:${src.name}`, 86400, src.cap))) break;
			let hits: AddrHit[] = [];
			try {
				hits = (await src.run(a, street, true, lang)).filter(usable);
			} catch {
				break; // this source is down or slow: try the next one
			}
			// Up to 3 exact matches in different cities, bigger cities first (no city typed: "Derech Arlozorov 100").
			const seenCity = new Set<string>();
			const exact = hits
				.filter((h) => h.exact)
				.sort((x, y) => cityOrder(x.city) - cityOrder(y.city))
				.filter((h) => {
					const k = norm(h.city ?? '');
					if (seenCity.has(k)) return false;
					seenCity.add(k);
					return true;
				})
				.slice(0, 3);
			if (exact.length) {
				const payload = { provider: src.name, results: exact.map((h) => toSuggestion(h, true)) };
				await cachePut(key, payload, 86400);
				return payload;
			}
			if (!streetOnly && hits[0]) streetOnly = { provider: src.name, hit: hits[0] };
		}
	}
	if (!streetOnly) {
		// Nobody knows the number: ask for the street alone (its centre).
		for (const src of ADDR_SOURCES) {
			if (!Deno.env.get(src.key) || streetOnly) continue;
			if (!(await bump(`geo:provider:${src.name}`, 86400, src.cap))) continue;
			try {
				const hit = (await src.run(a, a.street, false, lang)).find(usable);
				if (hit) streetOnly = { provider: src.name, hit };
			} catch {
				// next source
			}
		}
	}
	const payload = streetOnly ? { provider: streetOnly.provider, results: [toSuggestion(streetOnly.hit, false)] } : { provider: 'none', results: [] };
	await cachePut(key, payload, 86400);
	return payload.results.length ? payload : null;
}

async function handleSuggest(body: Record<string, unknown>, cors: Record<string, string>) {
	const q = typeof body.q === 'string' ? body.q.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
	const lang: Lang = body.lang === 'en' ? 'en' : 'he';
	if (q.length < 3 || q.length > 120) return json({ error: 'invalid_input' }, 400, cors);

	const cacheKey = `suggest5:${lang}:${await sha(q.toLowerCase())}`;
	const cached = await cacheGet<{ provider: string; results: Suggestion[] }>(cacheKey);
	if (cached) return json(cached, 200, cors);

	// A street with a house number gets a structured lookup alongside the usual suggestions; its answer goes first.
	const addrQ = parseAddress(q);
	const addrJob = addrQ ? addressSuggest(addrQ, lang).catch(() => null) : Promise.resolve(null);

	let general: { provider: string; results: Suggestion[] } | null = null;
	let anyAnswered = false;
	for (const p of PROVIDERS) {
		if (!p.enabled()) continue;
		if (!(await bump(`geo:provider:${p.name}`, 86400, p.dailyCap))) continue;
		try {
			const results = dedupe(await p.suggest(q, lang), q, lang);
			anyAnswered = true;
			general = { provider: p.name, results };
			if (results.length) break;
			// Nothing from this source: try the next one.
		} catch {
			// Timeout or error: try the next source.
		}
	}
	const addr = await addrJob;
	if (!addr && !anyAnswered) return json({ error: 'upstream_unavailable' }, 502, cors);
	const near = (x: Suggestion, y: Suggestion) => Math.abs(x.lat - y.lat) < 0.0005 && Math.abs(x.lon - y.lon) < 0.0005;
	const rest = (general?.results ?? []).filter((g) => !addr?.results.some((x) => near(x, g) && norm(x.label) === norm(g.label)));
	const payload = {
		// Attribution follows the source of the first suggestion.
		provider: addr ? addr.provider : (general?.provider ?? 'none'),
		results: [...(addr?.results ?? []), ...rest].slice(0, 6),
	};
	if (payload.results.length) await cachePut(cacheKey, payload, 86400);
	return json(payload, 200, cors);
}

async function handleReverse(body: Record<string, unknown>, cors: Record<string, string>) {
	const lat = Number(body.lat);
	const lon = Number(body.lon);
	const lang: Lang = body.lang === 'en' ? 'en' : 'he';
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inIsrael(lat, lon)) return json({ error: 'invalid_input' }, 400, cors);

	// ~100 m grid; the key is hashed so no coordinates sit in the cache table.
	const cacheKey = `reverse:${lang}:${await sha(`${lat.toFixed(3)},${lon.toFixed(3)}`)}`;
	const cached = await cacheGet<{ area: string | null }>(cacheKey);
	if (cached) return json({ area: fixNames(cached.area ?? undefined, lang) ?? null }, 200, cors);

	let area: string | null = null;
	// LocationIQ first: Photon blocks cloud servers, so it is only a last try.
	if (Deno.env.get('LOCATIONIQ_KEY') && (await bump('geo:provider:locationiq', 86400, 4000))) {
		try {
			const params = new URLSearchParams({ key: Deno.env.get('LOCATIONIQ_KEY')!, lat: String(lat), lon: String(lon), format: 'json', zoom: '14', 'accept-language': lang });
			const data = (await fetchJson(`https://us1.locationiq.com/v1/reverse?${params}`, 2000)) as { address?: Record<string, string> };
			const a = data.address ?? {};
			area = join(a.suburb ?? a.neighbourhood, a.city ?? a.town ?? a.village) ?? null;
		} catch {
			area = null;
		}
	}
	if (!area) {
		try {
			const params = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: '1' });
			if (lang === 'en') params.set('lang', 'en');
			const data = (await fetchJson(`https://photon.komoot.io/reverse?${params}`, 2000)) as {
				features: { properties: Record<string, string> }[];
			};
			const p = data.features[0]?.properties;
			if (p) area = join(p.district ?? p.locality, p.city ?? p.county) ?? null;
		} catch {
			area = null;
		}
	}

	area = fixNames(area ?? undefined, lang) ?? null;
	const payload = { area };
	if (area) await cachePut(cacheKey, payload, 30 * 86400);
	return json(payload, 200, cors);
}

Deno.serve(async (req: Request) => {
	const origin = req.headers.get('origin');
	const cors = corsHeaders(origin);
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
	if (origin && !ALLOWED_ORIGIN.test(origin)) return json({ error: 'forbidden' }, 403, cors);

	let body: Record<string, unknown>;
	try {
		const text = await req.text();
		if (text.length > 2000) return json({ error: 'invalid_input' }, 400, cors);
		body = JSON.parse(text);
	} catch {
		return json({ error: 'invalid_input' }, 400, cors);
	}

	const ip = await ipHash(req);
	if (body.action === 'suggest') {
		const ok = await checkLimits('geo', 'suggest', ip, [
			{ scope: 'ip', window: 60, max: 60 },
			{ scope: 'ip', window: 86400, max: 800 },
			{ scope: 'global', window: 60, max: 40 },
			{ scope: 'global', window: 86400, max: 8000 },
		]);
		if (!ok) return json({ error: 'busy' }, 429, cors, { 'Retry-After': '60' });
		// Stage timing only (no query text, no coordinates).
		const t0 = Date.now();
		const res = await handleSuggest(body, cors);
		console.log(JSON.stringify({ fn: 'geo', action: 'suggest', stage: 'geocode', ms: Date.now() - t0, status: res.status }));
		return res;
	}
	if (body.action === 'reverse') {
		const ok = await checkLimits('geo', 'reverse', ip, [
			{ scope: 'ip', window: 60, max: 10 },
			{ scope: 'global', window: 86400, max: 500 },
		]);
		if (!ok) return json({ error: 'busy' }, 429, cors, { 'Retry-After': '60' });
		return handleReverse(body, cors);
	}
	return json({ error: 'invalid_input' }, 400, cors);
});
