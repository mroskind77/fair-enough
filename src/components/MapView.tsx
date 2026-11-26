import * as maplibregl from 'maplibre-gl';
// MapLibre draws tiles in a background worker. Once bundled, it looks for the worker next to its own script, which
// doesn't exist on the live site ("Worker failed to load": black map, missing pins). Hand it the bundled URL.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';

import { personPinHtml } from '@/components/PersonMarker';
import { translate, useT } from '@/lib/i18n';
import { mapDebugOn, watchMap } from '@/lib/map-debug';
import type { Lang } from '@/lib/prefs';
import { useEffectiveTheme } from '@/lib/use-effective-theme';

maplibregl.setWorkerUrl(mapWorkerUrl);

/** MapLibre's on-map texts in the UI language (Hebrew or English). */
function mapLocale(lang: Lang): Record<string, string> {
	return {
		'CooperativeGesturesHandler.MobileHelpText': translate(lang, 'mapTwoFingers'),
		'CooperativeGesturesHandler.WindowsHelpText': translate(lang, 'mapCtrlZoom'),
		'CooperativeGesturesHandler.MacHelpText': translate(lang, 'mapCmdZoom'),
		'NavigationControl.ZoomIn': translate(lang, 'mapZoomIn'),
		'NavigationControl.ZoomOut': translate(lang, 'mapZoomOut'),
		'AttributionControl.ToggleAttribution': translate(lang, 'mapCredits'),
	};
}

export type MapPin =
	| { id: string; lat: number; lon: number; kind: 'person'; index: number; label: string }
	| { id: string; lat: number; lon: number; kind: 'place'; rank: number; label: string };

const STYLES = {
	light: 'https://tiles.openfreemap.org/styles/positron',
	dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Dark style overrides: the stock background is near-black and the coast disappears. */
function applyDarkPaint(map: maplibregl.Map) {
	const set = (id: string, prop: string, value: string) => {
		if (map.getLayer(id)) map.setPaintProperty(id, prop as 'background-color', value);
	};
	set('background', 'background-color', '#0E1114');
	set('water', 'fill-color', '#16222C');
	set('landuse_park', 'fill-color', '#15201A');
	set('landcover_wood', 'fill-color', '#15201A');
	set('highway_major_subtle', 'line-color', '#262C33');
	set('highway_minor', 'line-color', '#262C33');
	for (const layer of map.getStyle().layers ?? []) {
		if (layer.id.startsWith('place_') && layer.type === 'symbol') map.setPaintProperty(layer.id, 'text-color', '#8C949C');
	}
}

/**
 * The dark style asks for a "circle-11" town/city dot that its sprite doesn't have. Only that one icon is drawn
 * here (as a runtime image; the style itself is never edited). Any other missing icon is left alone.
 */
function addMissingImage(map: maplibregl.Map, id: string) {
	if (map.hasImage(id)) return;
	// Any other image the style names but doesn't ship (e.g. "wood-pattern"): a 1x1 transparent pixel, no warning.
	if (id !== 'circle-11') {
		map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
		return;
	}
	const size = 11;
	const data = new Uint8Array(size * size * 4);
	const r = 3.5;
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
			if (d > r + 1) continue;
			const k = (y * size + x) * 4;
			const inner = d <= r;
			// #8C949C fill (same grey as the dark map's place labels) with a dark rim.
			data.set(inner ? [0x8c, 0x94, 0x9c, 255] : [0x0e, 0x11, 0x14, 200], k);
		}
	map.addImage(id, { width: size, height: size, data });
}

/** The theme the page shows right now: the html data-theme, else the device setting. */
function themeNow(fallback: 'light' | 'dark'): 'light' | 'dark' {
	if (typeof window === 'undefined') return fallback;
	const set = document.documentElement.dataset.theme;
	if (set === 'light' || set === 'dark') return set;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Labels in the UI language, falling back to the local name. */
function applyLabelLanguage(map: maplibregl.Map, lang: Lang) {
	const field =
		lang === 'he'
			? ['coalesce', ['get', 'name:he'], ['get', 'name']]
			: ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
	for (const layer of map.getStyle().layers ?? []) {
		if (layer.type !== 'symbol') continue;
		const current = map.getLayoutProperty(layer.id, 'text-field');
		// Only labels that show a place or street name (road numbers, house numbers etc. keep their own text).
		if (current === undefined || !/name/.test(JSON.stringify(current))) continue;
		map.setLayoutProperty(layer.id, 'text-field', field as maplibregl.ExpressionSpecification);
	}
}

/** `wrap` is the element MapLibre positions (never restyle it wholesale); the ring is the button inside. */
function paintPlace(wrap: HTMLElement, selected: boolean, i: number) {
	const el = wrap.firstElementChild as HTMLElement | null;
	if (!el) return;
	el.style.cssText =
		PLACE_PIN +
		(selected
			? 'background:var(--fe-ink);color:var(--fe-on-ink);transform:scale(1.2);'
			: 'background:var(--fe-surface);color:var(--fe-ink);');
	el.setAttribute('aria-pressed', String(selected));
	// Place 1 above 2, 3… when places are close together; the selected one above all.
	wrap.style.zIndex = String(selected ? 3000 : 1000 - i);
}

interface MapViewProps {
	pins: MapPin[];
	label: string;
	className?: string;
	/** Place pin to highlight (the selected result row). */
	selectedId?: string | null;
	/** Tapping a place pin. */
	onSelect?: (id: string) => void;
}

const PLACE_PIN =
	"width:26px;height:26px;border-radius:9999px;display:grid;place-items:center;font:700 12px Rubik,system-ui,sans-serif;font-variant-numeric:tabular-nums;box-sizing:border-box;border:3px solid var(--fe-ink);cursor:pointer;padding:0;transition:transform .15s;";
const MIN_GAP_PX = 24;

/** Client-only map. The map is never mirrored in RTL. A language switch keeps the same map (labels change in place). */
export function MapView(props: MapViewProps) {
	const { lang } = useT();
	return <MapInner lang={lang} {...props} />;
}

/** The map's own control texts in the new language, on the existing map. */
function applyControlLanguage(map: maplibregl.Map, lang: Lang) {
	const loc = mapLocale(lang);
	const root = map.getContainer();
	const set = (sel: string, key: string) =>
		root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
			el.title = loc[key];
			el.setAttribute('aria-label', loc[key]);
		});
	set('.maplibregl-ctrl-zoom-in', 'NavigationControl.ZoomIn');
	set('.maplibregl-ctrl-zoom-out', 'NavigationControl.ZoomOut');
	set('.maplibregl-ctrl-attrib-button', 'AttributionControl.ToggleAttribution');
	const desk = root.querySelector('.maplibregl-desktop-message');
	if (desk) desk.textContent = /Mac/i.test(navigator.platform) ? loc['CooperativeGesturesHandler.MacHelpText'] : loc['CooperativeGesturesHandler.WindowsHelpText'];
	const mob = root.querySelector('.maplibregl-mobile-message');
	if (mob) mob.textContent = loc['CooperativeGesturesHandler.MobileHelpText'];
	// Keeps later MapLibre-built texts in the same language.
	(map as unknown as { _locale: Record<string, string> })._locale = { ...(map as unknown as { _locale: Record<string, string> })._locale, ...loc };
}

function MapInner({ pins, label, className = 'h-56', lang, selectedId = null, onSelect }: MapViewProps & { lang: Lang }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<maplibregl.Map | null>(null);
	const markersRef = useRef<maplibregl.Marker[]>([]);
	const theme = useEffectiveTheme();
	const themeRef = useRef(theme);
	const langRef = useRef(lang);
	langRef.current = lang;
	const onSelectRef = useRef(onSelect);
	onSelectRef.current = onSelect;
	const selectedRef = useRef(selectedId);
	selectedRef.current = selectedId;
	// Markers are rebuilt only when the pins themselves change, not on every render.
	// Labels aren't part of the key: a language switch relabels the same markers and leaves the camera alone.
	const pinKey = pins.map((p) => `${p.kind}:${p.id}:${p.lat}:${p.lon}:${p.kind === 'place' ? p.rank : p.index}`).join('|');
	const labelKey = pins.map((p) => p.label).join('|');

	// The map is built only once its box is on screen with a real size (the results page renders it while the list is
	// still loading), and every later size change resizes it. Light and dark use this same path.
	const [mapReady, setMapReady] = useState(false);
	useEffect(() => {
		const box = containerRef.current;
		if (!box) return;
		let map: maplibregl.Map | null = null;
		let heal = 0;
		const create = () => {
			// The theme as it is right now (not the first render's guess), so a new map never swaps style mid-load.
			const startTheme = themeNow(themeRef.current);
			themeRef.current = startTheme;
			const m = new maplibregl.Map({
				container: box,
				style: STYLES[startTheme],
				center: [34.95, 31.75],
				zoom: 6.4,
				attributionControl: { compact: false },
				cooperativeGestures: true,
				locale: mapLocale(langRef.current),
			});
			map = m;
			if (mapDebugOn()) watchMap(m, box, STYLES[startTheme], () => themeRef.current);
			m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
			// Kept on the map, so it covers every style set later (theme switches) too.
			m.setMissingStyleImageResolver(async (id) => addMissingImage(m, id));
			m.on('style.load', () => {
				applyLabelLanguage(m, langRef.current);
				if (themeRef.current === 'dark') applyDarkPaint(m);
				m.resize();
			});
			m.on('load', () => m.resize());
			m.on('error', (ev) => {
				const e = ev as unknown as { error?: { message?: string }; sourceId?: string };
				console.warn('[map]', e.sourceId ?? '', e.error?.message ?? '');
			});
			// Self-check 3 s in: if the box has a size but no base tile has been drawn, resize and reload the same
			// style once (same provider, same attribution).
			let drewTile = false;
			m.on('data', (ev) => {
				const e = ev as unknown as { dataType?: string; tile?: unknown };
				if (e.dataType === 'source' && e.tile) drewTile = true;
			});
			heal = window.setTimeout(() => {
				if (drewTile || !box.clientWidth || !box.clientHeight) return;
				console.warn('[map] no base tiles after 3 s; reloading the style');
				m.resize();
				m.setStyle(STYLES[themeRef.current], { diff: false });
			}, 3000);
			mapRef.current = m;
			setMapReady(true);
		};
		const ro = new ResizeObserver(() => {
			if (!box.clientWidth || !box.clientHeight) return;
			if (!map) create();
			else map.resize();
		});
		ro.observe(box);
		if (box.clientWidth && box.clientHeight) create();
		return () => {
			ro.disconnect();
			window.clearTimeout(heal);
			map?.remove();
			mapRef.current = null;
			setMapReady(false);
		};
	}, []);

	// Language switch: same map, same markers and camera; only the label text-field and control texts change.
	const firstLang = useRef(true);
	useEffect(() => {
		if (firstLang.current) {
			firstLang.current = false;
			return;
		}
		const map = mapRef.current;
		if (!map) return;
		applyControlLanguage(map, lang);
		if (map.isStyleLoaded()) applyLabelLanguage(map, lang);
		// Otherwise the style is still loading and its 'style.load' applies langRef.current.
	}, [lang, mapReady]);

	useEffect(() => {
		const map = mapRef.current;
		const want = themeNow(theme);
		if (!map || themeRef.current === want) return;
		themeRef.current = want;
		// One style swap on the same map, never a second map.
		map.setStyle(STYLES[want]);
	}, [theme, mapReady]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		for (const m of markersRef.current) m.remove();
		markersRef.current = pins.map((p, i) => {
			let el: HTMLElement;
			if (p.kind === 'person') {
				el = document.createElement('div');
				el.setAttribute('role', 'img');
				el.setAttribute('aria-label', p.label);
				el.innerHTML = personPinHtml(p.index);
				el.style.cssText = 'width:26px;height:26px;line-height:0;';
				el.style.zIndex = '2000';
			} else {
				// Places are interchange rings with their rank inside; tapping one selects its row.
				el = document.createElement('div');
				el.style.width = '26px';
				el.style.height = '26px';
				const btn = document.createElement('button');
				btn.setAttribute('type', 'button');
				btn.setAttribute('aria-label', p.label);
				btn.textContent = String(p.rank);
				el.appendChild(btn);
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					onSelectRef.current?.(p.id);
				});
				paintPlace(el, p.id === selectedRef.current, i);
			}
			return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
		});
		// Pins closer than 24 px on screen are fanned out so every number stays readable. People stay put.
		const declutter = () => {
			const placed: { x: number; y: number }[] = [];
			markersRef.current.forEach((m, i) => {
				const p = pins[i];
				const pt = map.project([p.lon, p.lat]);
				let dx = 0;
				let dy = 0;
				if (p.kind === 'place') {
					const clash = () => placed.some((q) => Math.hypot(q.x - (pt.x + dx), q.y - (pt.y + dy)) < MIN_GAP_PX);
					for (let k = 1; clash() && k < 40; k++) {
						const r = 15 * Math.sqrt(k);
						const a = k * 2.39996;
						dx = Math.round(r * Math.cos(a));
						dy = Math.round(r * Math.sin(a));
					}
				}
				m.setOffset([dx, dy]);
				placed.push({ x: pt.x + dx, y: pt.y + dy });
			});
		};
		map.on('moveend', declutter);
		if (pins.length === 0) return () => void map.off('moveend', declutter);
		const fit = () => {
			const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const bounds = new maplibregl.LngLatBounds();
			// Both people and every visible place.
			for (const p of pins) bounds.extend([p.lon, p.lat]);
			map.fitBounds(bounds, { padding: 40, maxZoom: 15, animate: !reduce });
			declutter();
		};
		// Fit once the map has loaded, so every pin ends up in view.
		if (map.loaded()) fit();
		else map.once('load', fit);
		return () => {
			map.off('moveend', declutter);
			map.off('load', fit);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pinKey, mapReady]);

	useEffect(() => {
		markersRef.current.forEach((m, i) => {
			const p = pins[i];
			if (!p) return;
			const el = m.getElement();
			(p.kind === 'person' ? el : el.querySelector('button'))?.setAttribute('aria-label', p.label);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [labelKey]);

	// Highlight the selected place pin without rebuilding the markers.
	useEffect(() => {
		markersRef.current.forEach((m, i) => {
			const p = pins[i];
			if (p?.kind === 'place') paintPlace(m.getElement(), p.id === selectedId, i);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedId, pinKey]);

	return (
		<div
			ref={containerRef}
			dir="ltr"
			role="region"
			aria-label={label}
			// isolate: pins (z-index up to 3000) stay inside the map, so dropdowns above the map are never covered.
			className={`relative isolate z-0 w-full overflow-hidden rounded-lg border border-border bg-surface-2 ${className}`}
		/>
	);
}
