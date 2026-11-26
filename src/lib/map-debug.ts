import type * as maplibregl from 'maplibre-gl';

/**
 * ?debug=map: read-only watch on every MapLibre map on the page. Nothing here changes how a map behaves; it only
 * listens to map events, wraps resize()/setStyle()/remove() to note when they ran, and reads tile timings the
 * browser already records.
 */
export interface MapDebugState {
	id: number;
	alive: boolean;
	/** Route path that created this map, when, and its box size then. */
	screen: string;
	createdAt: string;
	removedAt: string;
	boxAtCreate: string;
	container: { w: number; h: number; visible: boolean };
	canvas: { w: number; h: number; cssW: number; cssH: number };
	styleUrl: string;
	styleLoaded: boolean;
	theme: string;
	tiles: { requested: number; loaded: number; errored: number; lastUrl: string; lastStatus: string };
	lastError: string;
	loaded: boolean;
	tilesLoaded: boolean;
	zoom: number;
	center: string;
	contextLost: boolean;
	lastResize: string;
	lastSetStyle: string;
}

interface Entry {
	seen: { requested: Set<string>; loaded: Set<string>; errored: Set<string> };
	map: maplibregl.Map;
	box: HTMLElement;
	theme: () => string;
	state: MapDebugState;
}

const entries = new Map<number, Entry>();
let nextId = 1;
let perfStarted = false;
const listeners = new Set<() => void>();

/** On when ?debug=map is in the URL, and stays on for this tab (sessionStorage) across in-app navigation. */
export function mapDebugOn(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		if (new URLSearchParams(window.location.search).get('debug') === 'map') {
			sessionStorage.setItem('debugMap', '1');
			return true;
		}
		return sessionStorage.getItem('debugMap') === '1';
	} catch {
		return new URLSearchParams(window.location.search).get('debug') === 'map';
	}
}

export const routePath = () => (typeof window === 'undefined' ? '-' : window.location.pathname);

const stamp = () => {
	const d = new Date();
	return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const isTileUrl = (url: string) => /\.(pbf|mvt|png|jpg|jpeg|webp)(\?|$)/.test(url) || /\/\d+\/\d+\/\d+/.test(url);

function noteTileStatus(url: string, status: string) {
	for (const e of entries.values()) {
		if (!e.state.alive) continue;
		e.state.tiles.lastUrl = url;
		e.state.tiles.lastStatus = status;
	}
}

/** Tile HTTP status from the browser's own resource timings (Chrome/Edge give responseStatus; others show "n/a"). */
function startPerf() {
	if (perfStarted || typeof PerformanceObserver === 'undefined') return;
	perfStarted = true;
	try {
		const po = new PerformanceObserver((list) => {
			for (const en of list.getEntries() as PerformanceResourceTiming[]) {
				if (!isTileUrl(en.name)) continue;
				const st = (en as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
				noteTileStatus(en.name, st ? String(st) : en.transferSize === 0 && en.decodedBodySize === 0 ? 'n/a (no body/cached?)' : 'n/a');
			}
			refresh();
		});
		po.observe({ type: 'resource', buffered: false });
	} catch {
		// Resource timings unavailable: the status shows from tile errors only.
	}
}

function read(e: Entry) {
	const { map, box, state } = e;
	const r = box.getBoundingClientRect();
	const cs = getComputedStyle(box);
	state.container = {
		w: Math.round(r.width),
		h: Math.round(r.height),
		visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && box.isConnected,
	};
	if (!state.alive) return;
	try {
		const c = map.getCanvas();
		state.canvas = { w: c.width, h: c.height, cssW: Math.round(c.clientWidth), cssH: Math.round(c.clientHeight) };
		state.styleLoaded = map.isStyleLoaded() === true;
		state.loaded = map.loaded();
		state.tilesLoaded = map.areTilesLoaded();
		state.zoom = Math.round(map.getZoom() * 100) / 100;
		const ce = map.getCenter();
		state.center = `${ce.lat.toFixed(4)},${ce.lng.toFixed(4)}`;
		state.theme = e.theme();
	} catch (err) {
		state.lastError = `read failed: ${(err as Error).message}`;
	}
}

const lastLogged = new Map<number, string>();
function logLine(s: MapDebugState) {
	// Counters and the last tile URL change constantly; one console line per state change of everything else,
	// plus tile counts rounded so a loading burst is a few lines, not hundreds.
	const key = JSON.stringify({ ...s, route: routePath(), tiles: { ...s.tiles, lastUrl: '', requested: Math.floor(s.tiles.requested / 10), loaded: Math.floor(s.tiles.loaded / 10) }, zoom: s.zoom, center: s.center });
	if (lastLogged.get(s.id) === key) return;
	lastLogged.set(s.id, key);
	console.info(
		`[mapdebug] route=${routePath()} #${s.id} screen=${s.screen} created=${s.createdAt} boxAtCreate=${s.boxAtCreate}` +
			` removed=${s.removedAt === '-' ? 'no' : `yes ${s.removedAt}`} alive=${s.alive} maps=${liveCount()} box=${s.container.w}x${s.container.h} visible=${s.container.visible}` +
			` canvas=${s.canvas.w}x${s.canvas.h} (css ${s.canvas.cssW}x${s.canvas.cssH}) style=${s.styleUrl} styleLoaded=${s.styleLoaded}` +
			` theme=${s.theme} tiles req/ok/err=${s.tiles.requested}/${s.tiles.loaded}/${s.tiles.errored} lastTile=${s.tiles.lastUrl} status=${s.tiles.lastStatus}` +
			` loaded=${s.loaded} tilesLoaded=${s.tilesLoaded} zoom=${s.zoom} center=${s.center} ctxLost=${s.contextLost}` +
			` lastResize=${s.lastResize} lastSetStyle=${s.lastSetStyle} error=${s.lastError || '-'}`,
	);
}

let raf = 0;
function refresh() {
	if (raf || typeof window === 'undefined') return;
	raf = window.requestAnimationFrame(() => {
		raf = 0;
		for (const e of entries.values()) {
			read(e);
			logLine(e.state);
		}
		listeners.forEach((l) => l());
	});
}

export const liveCount = () => [...entries.values()].filter((e) => e.state.alive).length;

export function mapDebugSnapshot(): MapDebugState[] {
	// Polled by the panel, so route changes (Search, "Change") also produce a [mapdebug] line.
	for (const e of entries.values()) {
		read(e);
		logLine(e.state);
	}
	return [...entries.values()].map((e) => ({ ...e.state, tiles: { ...e.state.tiles } }));
}

export function subscribeMapDebug(fn: () => void) {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Starts watching one map. Only called when ?debug=map is in the URL. */
export function watchMap(map: maplibregl.Map, box: HTMLElement, styleUrl: string, theme: () => string) {
	startPerf();
	const id = nextId++;
	const state: MapDebugState = {
		id,
		alive: true,
		screen: routePath(),
		createdAt: stamp(),
		removedAt: '-',
		boxAtCreate: `${Math.round(box.getBoundingClientRect().width)}x${Math.round(box.getBoundingClientRect().height)}`,
		container: { w: 0, h: 0, visible: false },
		canvas: { w: 0, h: 0, cssW: 0, cssH: 0 },
		styleUrl,
		styleLoaded: false,
		theme: theme(),
		tiles: { requested: 0, loaded: 0, errored: 0, lastUrl: '-', lastStatus: '-' },
		lastError: '',
		loaded: false,
		tilesLoaded: false,
		zoom: 0,
		center: '-',
		contextLost: false,
		lastResize: '-',
		lastSetStyle: '-',
	};
	const entry: Entry = { map, box, theme, state, seen: { requested: new Set(), loaded: new Set(), errored: new Set() } };
	// Each tile (source + z/x/y, i.e. one tile URL) counts once, however many times a style swap reloads it.
	const tileKey = (e: { sourceId?: string; tile?: { tileID?: { canonical?: { z: number; x: number; y: number } } } }) => {
		const c = e.tile?.tileID?.canonical;
		return c ? `${e.sourceId ?? '?'}/${c.z}/${c.x}/${c.y}` : null;
	};
	const count = (kind: 'requested' | 'loaded' | 'errored', k: string | null) => {
		if (!k) return;
		entry.seen[kind].add(k);
		state.tiles[kind] = entry.seen[kind].size;
	};
	entries.set(id, entry);

	const m = map as unknown as Record<string, (...a: unknown[]) => unknown>;
	const origResize = m.resize.bind(map);
	m.resize = (...a: unknown[]) => {
		state.lastResize = stamp();
		refresh();
		return origResize(...a);
	};
	const origSetStyle = m.setStyle.bind(map);
	m.setStyle = (...a: unknown[]) => {
		state.lastSetStyle = stamp();
		if (typeof a[0] === 'string') state.styleUrl = a[0];
		refresh();
		return origSetStyle(...a);
	};
	const origRemove = m.remove.bind(map);
	m.remove = (...a: unknown[]) => {
		state.alive = false;
		state.removedAt = stamp();
		refresh();
		return origRemove(...a);
	};

	map.on('dataloading', (ev) => {
		const e = ev as unknown as Parameters<typeof tileKey>[0] & { dataType?: string };
		if (e.dataType === 'source' && e.tile) count('requested', tileKey(e));
		refresh();
	});
	map.on('data', (ev) => {
		const e = ev as unknown as Parameters<typeof tileKey>[0] & { dataType?: string };
		if (e.dataType === 'source' && e.tile) count('loaded', tileKey(e));
		refresh();
	});
	map.on('error', (ev) => {
		const e = ev as unknown as Parameters<typeof tileKey>[0] & { error?: { message?: string; status?: number; url?: string } };
		if (e.tile) count('errored', tileKey(e) ?? e.error?.url ?? null);
		if (e.error?.url) noteTileStatus(e.error.url, e.error.status ? String(e.error.status) : 'error');
		state.lastError = `${stamp()} ${e.sourceId ? `[${e.sourceId}] ` : ''}${e.error?.message ?? 'unknown'}`;
		refresh();
	});
	for (const evt of ['load', 'style.load', 'styledata', 'idle', 'moveend', 'resize'] as const) map.on(evt, refresh);
	map.on('webglcontextlost', () => {
		state.contextLost = true;
		refresh();
	});
	map.on('webglcontextrestored', () => {
		state.contextLost = false;
		refresh();
	});
	const ro = new ResizeObserver(refresh);
	ro.observe(box);
	map.once('remove', () => ro.disconnect());
	refresh();
}
