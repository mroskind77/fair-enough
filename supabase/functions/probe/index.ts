// Fair Enough — M0 probe (temporary; deleted after the probe results are recorded).
// Reports the runtime, which IP headers arrive, and renders a Hebrew PNG.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import satori from 'npm:satori@0.12.2';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';
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
		'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		Vary: 'Origin',
	};
}

const IP_HEADERS = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for', 'forwarded', 'true-client-ip', 'x-client-ip', 'cf-ipcountry', 'x-envoy-external-address'];

let wasmReady: Promise<void> | null = null;
let fonts: { he: ArrayBuffer; latin: ArrayBuffer } | null = null;

async function renderPng(): Promise<string> {
	wasmReady ??= initWasm(fetch('https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm'));
	await wasmReady;
	fonts ??= {
		he: await (await fetch('https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans-hebrew@latest/hebrew-600-normal.woff')).arrayBuffer(),
		latin: await (await fetch('https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans@latest/latin-600-normal.woff')).arrayBuffer(),
	};
	const svg = await satori(
		{
			type: 'div',
			props: {
				style: { width: 600, height: 315, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', padding: 40, background: '#F2EEE6', color: '#1E2124', fontFamily: 'Plex' },
				children: [
					{ type: 'div', props: { style: { fontSize: 44 }, children: 'נפגשים ב-14:30 בתל אביב' } },
					{ type: 'div', props: { style: { fontSize: 24, color: '#C8372D', marginTop: 12 }, children: 'המקום ההוגן להיפגש · probe-ok' } },
				],
			},
		},
		{ width: 600, height: 315, fonts: [ { name: 'Plex', data: fonts.he, weight: 600, style: 'normal' }, { name: 'Plex', data: fonts.latin, weight: 600, style: 'normal' } ] },
	);
	const png = new Resvg(svg).render().asPng();
	let bin = '';
	for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
	return `data:image/png;base64,${btoa(bin)}`;
}

const SOURCES: Record<string, string> = {
	photon: 'https://photon.komoot.io/api?q=dizengoff&limit=1',
	photonReverse: 'https://photon.komoot.io/reverse?lat=32.0786&lon=34.7741&limit=1',
	overpass: 'https://overpass-api.de/api/status',
	osrm: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/34.77,32.07;34.80,32.08?overview=false',
	transitous: transitousUrl('v1/geocode', { text: 'Tel Aviv' }),
	hebcal: 'https://www.hebcal.com/shabbat?cfg=json&geonameid=293397&M=on',
};

async function checkSources() {
	const out: Record<string, string> = {};
	await Promise.all(
		Object.entries(SOURCES).map(async ([name, url]) => {
			const t0 = Date.now();
			try {
				const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': USER_AGENT } });
				const text = await r.text();
				out[name] = `${r.status} in ${Date.now() - t0} ms${r.ok ? '' : ': ' + text.slice(0, 120)}`;
			} catch (e) {
				out[name] = `failed after ${Date.now() - t0} ms: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`;
			}
		}),
	);
	return out;
}

Deno.serve(async (req: Request) => {
	const origin = req.headers.get('origin');
	const cors = corsHeaders(origin);
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	const reply = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
	if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

	// Small global cap so the probe can't be used to burn resources.
	const { data: allowed } = await db.rpc('bump', { p_key: 'probe:all:3600', p_window_seconds: 3600, p_limit: 120 });
	if (allowed !== true) return reply({ error: 'busy' }, 429);

	const headers: Record<string, string | null> = {};
	for (const h of IP_HEADERS) headers[h] = req.headers.get(h);

	let png: string | null = null;
	let pngError: string | null = null;
	const started = Date.now();
	try {
		png = await renderPng();
	} catch (e) {
		pngError = e instanceof Error ? e.message.slice(0, 200) : 'render failed';
	}

	return reply({
		runtime: { deno: Deno.version.deno, v8: Deno.version.v8, typescript: Deno.version.typescript, region: Deno.env.get('SB_REGION') ?? null },
		origin,
		originAllowed: origin ? ALLOWED_ORIGIN.test(origin) : null,
		ipHeaders: headers,
		sources: await checkSources(),
		pngMs: Date.now() - started,
		png,
		pngError,
	});
});
