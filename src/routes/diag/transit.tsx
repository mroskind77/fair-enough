import { createFileRoute, notFound } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import { DefaultNotFoundPage } from '@/components/DefaultNotFoundPage';
import { PageShell } from '@/components/PageShell';
import { supabase } from '@/integrations/supabase/client';

// Unlisted Transitous diagnostic. Not linked anywhere, noindex, and kept out of the sitemap and llms.txt.
const keyShape = (k: unknown): k is string => typeof k === 'string' && k.length >= 16 && k.length <= 200;

// No key in the address → 404. A wrong key → the backend answers 404 and the page shows "not found".
export const Route = createFileRoute('/diag/transit')({
	validateSearch: (s: Record<string, unknown>): { key?: string } => (keyShape(s.key) ? { key: s.key } : {}),
	beforeLoad: ({ search }) => {
		if (!keyShape(search.key)) throw notFound();
	},
	head: () => ({ meta: [{ title: 'Transit diagnostic' }, { name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] }),
	component: DiagTransit,
});

type Outcome = 'ok' | 'hit' | 'shared' | 'dropped' | 'skip' | 'cap' | 'timeout' | 'refused' | 'dns' | 'tls' | 'network' | '4xx' | '429' | '5xx';

interface TestResult {
	ok: boolean;
	status: number | null;
	ms: number;
	ttfb: number | null;
	bytes: number | null;
	itineraries: number | null;
	error: Outcome | 'cors' | null;
	detail?: string | null;
}

interface DiagState {
	userAgent: string;
	test: { from: string; to: string; when: string; url: string };
	skip: { on: boolean; until: string | null };
	today: { since: string; used: number; cap: number; realCalls: number; cacheHits: number; hitRate: number | null; byOutcome: Record<string, number> };
	searches: { sid: string; at: string; calls: number; hits: number; other: number; dropped: number; timeout: number; rows: { visible: number; real: number } | null }[];
	recent: { at: string; sid: string | null; endpoint: string; outcome: Outcome; status: number | null; ms: number | null; bytes: number | null }[];
	serverErrors?: { count: number; latest: { at: string; action: string | null; sid: string | null; status: number; cause: string }[] };
}

/** The browser half: the same trip straight from this browser to Transitous (the browser sends its own Referer). */
async function browserTest(url: string): Promise<TestResult> {
	const t0 = performance.now();
	let status: number | null = null;
	let ttfb: number | null = null;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(15000), referrerPolicy: 'origin', headers: { Accept: 'application/json' } });
		ttfb = Math.round(performance.now() - t0);
		status = res.status;
		const text = await res.text();
		const ms = Math.round(performance.now() - t0);
		let itineraries: number | null = null;
		try {
			itineraries = (JSON.parse(text) as { itineraries?: unknown[] }).itineraries?.length ?? 0;
		} catch {
			itineraries = null;
		}
		const error: Outcome | null = res.ok ? null : status === 429 ? '429' : status >= 500 ? '5xx' : '4xx';
		return { ok: res.ok, status, ms, ttfb, bytes: text.length, itineraries, error };
	} catch (e) {
		const ms = Math.round(performance.now() - t0);
		const timeout = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
		// Browsers hide the reason for network failures (refused, DNS, TLS and blocked requests all look the same).
		return { ok: false, status, ms, ttfb, bytes: null, itineraries: null, error: timeout ? 'timeout' : 'network', detail: e instanceof Error ? e.message.slice(0, 160) : null };
	}
}

const SLOW_MS = 5000;
const fine = (r: TestResult) => r.ok && r.ms < SLOW_MS;
const bad = (r: TestResult) => !r.ok || r.ms >= SLOW_MS;

function verdict(server: TestResult, browser: TestResult): { text: string; tone: 'good' | 'warn' | 'bad' } {
	if (bad(server) && fine(browser)) return { text: 'Our server is likely blocked or rate-limited by Transitous.', tone: 'bad' };
	if (bad(server) && bad(browser)) return { text: 'Transitous is slow or down for everyone.', tone: 'warn' };
	if (fine(server) && fine(browser)) return { text: 'Transitous is working for us.', tone: 'good' };
	// Server fine, browser not: a local network or browser problem, not Transitous and not us.
	return { text: 'Transitous is working for us. (Only this browser had trouble reaching it.)', tone: 'good' };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const kb = (b: number | null) => (b == null ? '–' : b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`);

function DiagTransit() {
	const { key } = Route.useSearch();
	const [state, setState] = useState<DiagState | null>(null);
	const [missing, setMissing] = useState(false);
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const [server, setServer] = useState<TestResult | null>(null);
	const [browser, setBrowser] = useState<TestResult | null>(null);

	const call = useCallback(
		async (action: 'state' | 'run') => {
			if (!supabase) return { status: 0, data: null };
			const { data, error } = await supabase.functions.invoke('diag', { body: { key, action } });
			const status = error && 'context' in error && error.context instanceof Response ? error.context.status : error ? 0 : 200;
			return { status, data };
		},
		[key],
	);

	const refresh = useCallback(async () => {
		const r = await call('state');
		if (r.status === 404) setMissing(true);
		else if (r.data) setState(r.data as DiagState);
	}, [call]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const run = async () => {
		if (!state) return;
		setBusy(true);
		setNote(null);
		setServer(null);
		setBrowser(null);
		// Both halves start together; the server one is the gate for the one-run-a-minute limit.
		const serverP = call('run');
		const browserP = browserTest(state.test.url);
		const s = await serverP;
		if (s.status === 429) {
			setNote('One run a minute. Try again shortly.');
			await browserP.catch(() => null);
			setBusy(false);
			return;
		}
		const b = await browserP;
		const body = s.data as { server: TestResult; state: DiagState } | null;
		if (body?.server) setServer(body.server);
		if (body?.state) setState(body.state);
		setBrowser(b);
		setBusy(false);
	};

	if (missing) return <DefaultNotFoundPage />;

	const v = server && browser ? verdict(server, browser) : null;
	const card = 'flex flex-col gap-2 rounded-sm border border-border p-4';
	return (
		<PageShell>
			<div dir="ltr" className="flex flex-col gap-6 text-start">
				<header className="flex flex-col gap-1">
					<h1 className="text-2xl font-semibold">Transitous diagnostic</h1>
					{state && (
						<p className="text-sm text-muted-foreground">
							{state.test.from} → {state.test.to}, {state.test.when}. Each run makes 2 calls (one from our server, one from this browser), at most one run a minute,
							and doesn't count as a search.
						</p>
					)}
				</header>

				<button type="button" onClick={() => void run()} disabled={busy || !state} className="min-h-12 self-start rounded-sm bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50">
					{busy ? 'Running…' : 'Run test'}
				</button>
				{note && <p className="text-sm text-destructive">{note}</p>}

				{v && (
					<p
						className={`rounded-sm border p-4 text-lg font-semibold ${v.tone === 'good' ? 'border-border' : 'border-destructive text-destructive'}`}
						role="status"
					>
						{v.text}
					</p>
				)}

				{(server || browser) && (
					<div className="grid gap-4 sm:grid-cols-2">
						{server && <ResultCard title="From our server (with our User-Agent)" r={server} />}
						{browser && <ResultCard title="From this browser" r={browser} />}
					</div>
				)}

				{state && (
					<>
						<section className={card}>
							<h2 className="font-semibold">Current state</h2>
							<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
								<dt className="text-muted-foreground">15-minute skip</dt>
								<dd className={state.skip.on ? 'font-semibold text-destructive' : ''}>{state.skip.on && state.skip.until ? `On until ${time(state.skip.until)}` : 'Off'}</dd>
								<dt className="text-muted-foreground">Calls today</dt>
								<dd>
									{state.today.used} of {state.today.cap}
								</dd>
								<dt className="text-muted-foreground">Cache hit rate today</dt>
								<dd>
									{state.today.hitRate == null ? '–' : `${Math.round(state.today.hitRate * 100)}%`} ({state.today.cacheHits} saved, {state.today.realCalls} real calls)
								</dd>
								<dt className="text-muted-foreground">Outcomes today</dt>
								<dd>{Object.entries(state.today.byOutcome).map(([k, n]) => `${k} ${n}`).join(' · ') || '–'}</dd>
								<dt className="text-muted-foreground">Search 5xx today</dt>
								<dd className={state.serverErrors?.count ? 'font-semibold text-destructive' : ''}>
									{state.serverErrors?.count ?? 0}
									{state.serverErrors?.latest.length ? (
										<ul className="mt-1 flex flex-col gap-0.5 text-xs font-normal text-muted-foreground">
											{state.serverErrors.latest.map((e) => (
												<li key={`${e.at}-${e.sid}`}>
													{time(e.at)} · {e.status} · {e.action ?? '–'} · {e.sid ?? '–'} · {e.cause}
												</li>
											))}
										</ul>
									) : null}
								</dd>
								<dt className="text-muted-foreground">User-Agent</dt>
								<dd className="break-all">{state.userAgent}</dd>
							</dl>
							<p className="text-xs text-muted-foreground">Day counted in UTC (resets 02:00/03:00 Israel time).</p>
						</section>

						<section className={card}>
							<h2 className="font-semibold">Calls per search (latest today)</h2>
							{state.searches.length ? (
								<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead className="text-muted-foreground">
										<tr className="text-start">
											<th className="py-1 text-start font-normal">Started</th>
											<th className="py-1 text-start font-normal">Search</th>
											<th className="py-1 text-end font-normal">Calls</th>
											<th className="py-1 text-end font-normal">Cache/shared</th>
											<th className="py-1 text-end font-normal">No call</th>
											<th className="py-1 text-end font-normal">Dropped</th>
											<th className="py-1 text-end font-normal">Timeout</th>
											<th className="py-1 text-end font-normal">Rows with real times</th>
										</tr>
									</thead>
									<tbody>
										{state.searches.map((s) => (
											<tr key={s.sid} className="border-t border-border">
												<td className="py-1">{time(s.at)}</td>
												<td className="py-1 font-mono text-xs">{s.sid}</td>
												<td className="py-1 text-end">{s.calls}</td>
												<td className="py-1 text-end">{s.hits}</td>
												<td className="py-1 text-end">{s.other}</td>
												<td className="py-1 text-end">{s.dropped ?? 0}</td>
												<td className="py-1 text-end">{s.timeout ?? 0}</td>
												<td className="py-1 text-end">{s.rows ? `${s.rows.real} of ${s.rows.visible}` : '–'}</td>
											</tr>
										))}
									</tbody>
								</table>
								</div>
							) : (
								<p className="text-sm text-muted-foreground">No bus searches yet today.</p>
							)}
						</section>

						<section className={card}>
							<h2 className="font-semibold">Last 20 server-side lookups</h2>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead className="text-muted-foreground">
										<tr>
											<th className="py-1 text-start font-normal">Time</th>
											<th className="py-1 text-start font-normal">Endpoint</th>
											<th className="py-1 text-start font-normal">Result</th>
											<th className="py-1 text-end font-normal">Status</th>
											<th className="py-1 text-end font-normal">ms</th>
										</tr>
									</thead>
									<tbody>
										{state.recent.map((r, i) => (
											<tr key={i} className="border-t border-border">
												<td className="py-1">{time(r.at)}</td>
												<td className="py-1">{r.endpoint}</td>
												<td className={`py-1 ${['timeout', 'refused', 'dns', 'tls', 'network', '4xx', '429', '5xx'].includes(r.outcome) ? 'text-destructive' : ''}`}>{LABEL[r.outcome] ?? r.outcome}</td>
												<td className="py-1 text-end">{r.status ?? '–'}</td>
												<td className="py-1 text-end">{r.ms ?? '–'}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					</>
				)}
			</div>
		</PageShell>
	);
}

const LABEL: Partial<Record<Outcome, string>> = {
	ok: 'ok',
	hit: 'cache hit (no call)',
	shared: 'shared lookup (no call)',
	dropped: 'dropped from queue (no call)',
	skip: '15-min skip on (no call)',
	cap: 'daily cap reached (no call)',
	timeout: 'timeout',
};

function ResultCard({ title, r }: { title: string; r: TestResult }) {
	const rows: [string, string][] = [
		['Result', r.ok ? 'OK' : `Failed: ${r.error ?? 'error'}`],
		['HTTP status', r.status == null ? '–' : String(r.status)],
		['Total time', `${r.ms} ms`],
		['Time to first byte', r.ttfb == null ? '–' : `${r.ttfb} ms`],
		['Response size', kb(r.bytes)],
		['Itineraries', r.itineraries == null ? '–' : String(r.itineraries)],
	];
	if (r.detail) rows.push(['Detail', r.detail]);
	return (
		<section className="flex flex-col gap-2 rounded-sm border border-border p-4">
			<h2 className="font-semibold">{title}</h2>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				{rows.map(([k, val]) => (
					<div key={k} className="contents">
						<dt className="text-muted-foreground">{k}</dt>
						<dd className={k === 'Result' && !r.ok ? 'font-semibold text-destructive' : 'break-all'}>{val}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
