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
