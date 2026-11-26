// Fair Enough — diag: Transitous diagnostic for /diag/transit. Unlisted; every action needs the DIAG_KEY secret,
// and a wrong or missing key gets a plain 404 so the endpoint gives nothing away.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

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

const json = (body: unknown, status: number, cors: Record<string, string>) =>
	new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

/** Constant-time comparison so the key can't be guessed from response times. */
function keyOk(given: unknown): boolean {
	const want = Deno.env.get('DIAG_KEY') ?? '';
	if (typeof given !== 'string' || want.length < 16 || given.length !== want.length) return false;
	let diff = 0;
	for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
	return diff === 0;
}

// The fixed test trip: Tel Aviv Savidor Center station → Jerusalem Central Bus Station, next weekday (Sun–Thu) 10:00.
const FROM = { name: 'Tel Aviv Savidor Center', lat: 32.08385, lon: 34.79835 };
const TO = { name: 'Jerusalem Central Bus Station', lat: 31.78917, lon: 35.20306 };

const tzFmt = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Jerusalem',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	weekday: 'short',
	hourCycle: 'h23',
});
const parts = (ms: number) => Object.fromEntries(tzFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));

/** Next Sun–Thu after today, 10:00 Israel time, as a UTC instant. */
function testTime(): { utc: string; local: string } {
	let day = Date.now() + 86400000;
	for (let i = 0; i < 7 && ['Fri', 'Sat'].includes(parts(day).weekday); i++) day += 86400000;
	const p = parts(day);
	const wall = Date.UTC(+p.year, +p.month - 1, +p.day, 10, 0);
	// Israel is UTC+2 or +3; find the offset at that wall time.
	const q = parts(wall - 2 * 3600000);
	const offsetMin = (Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute) - (wall - 2 * 3600000)) / 60000;
	const utcMs = wall - offsetMin * 60000;
	return { utc: new Date(utcMs).toISOString().slice(0, 19) + 'Z', local: `${p.year}-${p.month}-${p.day} 10:00 (${p.weekday})` };
}

function testUrl() {
	const t = testTime();
	return {
		when: t.local,
		url: transitousUrl('v5/plan', {
			fromPlace: `${FROM.lat},${FROM.lon}`,
			toPlace: `${TO.lat},${TO.lon}`,
			time: t.utc,
			arriveBy: false,
			numItineraries: 5,
		}),
	};
}

const dayStart = () => new Date(Math.floor(Date.now() / 86400000) * 86400000);

async function state() {
	const since = dayStart().toISOString();
	const [skipRow, counter, recent, today, errs] = await Promise.all([
		db.from('cache').select('fetched_at, ttl_seconds').eq('key', 'transitous:down').maybeSingle(),
		db.from('rate_counter').select('count').eq('key', TRANSIT_DAY_COUNTER).eq('window_start', since).maybeSingle(),
		db.from('transit_call').select('at, sid, endpoint, outcome, status, ms, bytes').order('at', { ascending: false }).limit(20),
		db.from('transit_call').select('sid, endpoint, outcome, at').gte('at', since).order('at', { ascending: false }).limit(5000),
		db.from('fn_error').select('at, action, sid, status, cause').gte('at', since).order('at', { ascending: false }).limit(200),
	]);
	const errRows = (errs.data ?? []) as { at: string; action: string | null; sid: string | null; status: number; cause: string }[];
	const skipUntil = skipRow.data ? new Date(skipRow.data.fetched_at).getTime() + skipRow.data.ttl_seconds * 1000 : 0;
	const rows = (today.data ?? []) as { sid: string | null; endpoint: string; outcome: CallOutcome; at: string }[];
	const real = rows.filter((r) => REAL_CALL.includes(r.outcome));
	const saved = rows.filter((r) => r.outcome === 'hit' || r.outcome === 'shared');
	const byOutcome: Record<string, number> = {};
	for (const r of rows) byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
	// Calls per search: the last 10 searches that touched Transitous today.
	const per = new Map<string, { sid: string; at: string; calls: number; hits: number; other: number; dropped: number; timeout: number }>();
	for (const r of rows) {
		if (!r.sid) continue;
		const e = per.get(r.sid) ?? { sid: r.sid, at: r.at, calls: 0, hits: 0, other: 0, dropped: 0, timeout: 0 };
		if (REAL_CALL.includes(r.outcome)) e.calls++;
		else if (r.outcome === 'hit' || r.outcome === 'shared') e.hits++;
		else e.other++;
		if (r.outcome === 'dropped') e.dropped++;
		if (r.outcome === 'timeout') e.timeout++;
		if (r.at < e.at) e.at = r.at;
		per.set(r.sid, e);
	}
	const latest = [...per.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
	// Visible rows that ended with real times: rows the device was shown (checked, not faded) whose every bus/train
	// time came from a real trip plan. Read from the stored search (the search id is the pool id).
	const pools = latest.length
		? ((await db.from('search_pool').select('id, pool').in('id', latest.map((e) => e.sid))).data ?? [])
		: [];
	const rowsOf = new Map<string, { visible: number; real: number }>();
	for (const p of pools as { id: string; pool: { st?: string; checked?: boolean; per: { mode: string; estimate: boolean }[] }[] }[]) {
		const shown = (p.pool ?? []).filter((v) => v.checked && v.st !== 'skip');
		rowsOf.set(p.id, { visible: shown.length, real: shown.filter((v) => v.per.every((x) => x.mode !== 'transit' || !x.estimate)).length });
	}
	const searches = latest.map((e) => ({ ...e, sid: e.sid.slice(0, 8), rows: rowsOf.get(e.sid) ?? null }));
	return {
		userAgent: USER_AGENT,
		test: { from: FROM.name, to: TO.name, ...testUrl() },
		skip: { on: skipUntil > Date.now(), until: skipUntil > Date.now() ? new Date(skipUntil).toISOString() : null },
		today: {
			since,
			used: counter.data?.count ?? 0,
			cap: TRANSIT_DAILY_CAP,
			realCalls: real.length,
			cacheHits: saved.length,
			hitRate: real.length + saved.length ? saved.length / (real.length + saved.length) : null,
			byOutcome,
		},
		searches,
		// Search-function 5xx today (UTC day), newest first. Search id only, never coordinates.
		serverErrors: {
			count: errRows.length,
			latest: errRows.slice(0, 10).map((e) => ({ ...e, sid: e.sid ? e.sid.slice(0, 8) : null })),
		},
		recent: (recent.data ?? []).map((r) => ({ ...r, sid: r.sid ? String(r.sid).slice(0, 8) : null })),
	};
}

/** The server half of the test: one Transitous call with our User-Agent, timed. */
async function serverTest(url: string) {
	const t0 = performance.now();
	let status: number | undefined;
	let ttfb: number | undefined;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: TRANSITOUS_HEADERS });
		ttfb = Math.round(performance.now() - t0); // fetch resolves when the headers arrive
		status = res.status;
		const text = await res.text();
		const ms = Math.round(performance.now() - t0);
		let itineraries: number | null = null;
		try {
			itineraries = (JSON.parse(text) as { itineraries?: unknown[] }).itineraries?.length ?? 0;
		} catch {
			itineraries = null;
		}
		const outcome: CallOutcome = res.ok ? 'ok' : classify(null, status);
		await logCall(db, { endpoint: 'diag', outcome, status, ms, bytes: text.length });
		return { ok: res.ok, status, ms, ttfb, bytes: text.length, itineraries, error: res.ok ? null : outcome };
	} catch (e) {
		const ms = Math.round(performance.now() - t0);
		const outcome = classify(e, status);
		await logCall(db, { endpoint: 'diag', outcome, status, ms });
		return { ok: false, status: status ?? null, ms, ttfb: ttfb ?? null, bytes: null, itineraries: null, error: outcome, detail: e instanceof Error ? e.message.slice(0, 160) : null };
	}
}

Deno.serve(async (req: Request) => {
	const cors = corsHeaders(req.headers.get('origin'));
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'not_found' }, 404, cors);
	let body: Record<string, unknown> = {};
	try {
		body = await req.json();
	} catch {
		return json({ error: 'not_found' }, 404, cors);
	}
	if (!keyOk(body.key)) return json({ error: 'not_found' }, 404, cors);

	if (body.action === 'state') return json(await state(), 200, cors);
	if (body.action === 'run') {
		// At most one run a minute (each run = 1 server call + 1 browser call). Not a search: the 60 a day is untouched.
		// Rolling 60 s since the last run (a clock-minute counter would let two runs through at :59 and :00).
		const { data: last } = await db
			.from('transit_call')
			.select('at')
			.eq('endpoint', 'diag')
			.gt('at', new Date(Date.now() - 60_000).toISOString())
			.limit(1);
		if (last?.length) return json({ error: 'wait' }, 429, cors);
		// Backstop against two runs starting at the same instant.
		const { data: allowed } = await db.rpc('bump', { p_key: 'diag:run:all:60', p_window_seconds: 60, p_limit: 1 });
		if (allowed !== true) return json({ error: 'wait' }, 429, cors);
		// Counts toward the 650 a day like any real call, but runs even while the 15-minute skip is on.
		await db.rpc('bump', { p_key: TRANSIT_DAY_COUNTER, p_window_seconds: 86400, p_limit: TRANSIT_DAILY_CAP + 1000 });
		const { url } = testUrl();
		const server = await serverTest(url);
		return json({ server, state: await state() }, 200, cors);
	}
	return json({ error: 'not_found' }, 404, cors);
});
