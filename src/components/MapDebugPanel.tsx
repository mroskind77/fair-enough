import { useEffect, useState } from 'react';

import { type MapDebugState, liveCount, mapDebugOn, mapDebugSnapshot, routePath, subscribeMapDebug } from '@/lib/map-debug';

const yn = (b: boolean) => (b ? 'yes' : 'no');

/** Only with ?debug=map in the URL: a live readout of every map on the page. */
export function MapDebugPanel() {
	const [on, setOn] = useState(false);
	const [list, setList] = useState<MapDebugState[]>([]);
	// Collapsed by default to one small line, so it never covers buttons on a phone.
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const check = () => setOn(mapDebugOn());
		check();
		window.addEventListener('popstate', check);
		const poll = window.setInterval(check, 1000);
		return () => {
			window.removeEventListener('popstate', check);
			window.clearInterval(poll);
		};
	}, []);
	useEffect(() => {
		if (!on) return;
		const update = () => setList(mapDebugSnapshot());
		update();
		const off = subscribeMapDebug(update);
		const tick = window.setInterval(update, 500);
		return () => {
			off();
			window.clearInterval(tick);
		};
	}, [on]);
	if (!on) return null;
	if (!open)
		return (
			<button
				type="button"
				dir="ltr"
				onClick={() => setOpen(true)}
				aria-expanded={false}
				className="fixed bottom-2 left-2 z-[9999] rounded-sm border border-border bg-background/95 px-2 py-1 font-mono text-[10px] leading-tight text-foreground shadow-lg"
			>
				map debug ▸
			</button>
		);
	return (
		<div
			dir="ltr"
			className="pointer-events-auto fixed bottom-2 left-2 z-[9999] max-h-[45vh] max-w-[calc(100vw-1rem)] overflow-auto rounded-sm border border-border bg-background/95 p-2 font-mono text-[10px] leading-tight text-foreground shadow-lg"
		>
			<button type="button" onClick={() => setOpen(false)} aria-expanded className="mb-1 underline">
				map debug ▾ (collapse)
			</button>
			<div>route {routePath()}</div>
			<div>maps alive: {liveCount()} · created this page load: {list.length}</div>
			{list.length === 0 && <div>no map created yet</div>}
			{list.map((s) => (
				<div key={s.id} className="mt-1 border-t border-border pt-1 break-all">
					<div>#{s.id} {s.alive ? 'alive' : 'removed'} · screen {s.screen}</div>
					<div>created {s.createdAt} (box {s.boxAtCreate}) · remove() {s.removedAt === '-' ? 'no' : `yes ${s.removedAt}`}</div>
					<div>box {s.container.w}x{s.container.h} visible {yn(s.container.visible)}</div>
					<div>canvas {s.canvas.w}x{s.canvas.h} (css {s.canvas.cssW}x{s.canvas.cssH}) ctxLost {yn(s.contextLost)}</div>
					<div>style {s.styleUrl}</div>
					<div>styleLoaded {yn(s.styleLoaded)} theme {s.theme}</div>
					<div>tiles (unique) req {s.tiles.requested} ok {s.tiles.loaded} err {s.tiles.errored}</div>
					<div>last tile [{s.tiles.lastStatus}] {s.tiles.lastUrl}</div>
					<div>loaded() {yn(s.loaded)} areTilesLoaded() {yn(s.tilesLoaded)}</div>
					<div>zoom {s.zoom} center {s.center}</div>
					<div>last resize {s.lastResize} · last setStyle {s.lastSetStyle}</div>
					<div>last error {s.lastError || '-'}</div>
				</div>
			))}
		</div>
	);
}
