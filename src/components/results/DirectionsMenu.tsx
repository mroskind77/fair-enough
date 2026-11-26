import { Bus, MapPin, Navigation, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Sheet } from '@/components/Sheet';
import { useT } from '@/lib/i18n';
import { venueLinks, type Venue } from '@/lib/search-client';

interface App {
	id: 'waze' | 'google' | 'moovit';
	label: string;
	Icon: LucideIcon;
	color: string;
}

const APPS: App[] = [
	{ id: 'waze', label: 'Waze', Icon: Navigation, color: '#33CCFF' },
	{ id: 'google', label: 'Google Maps', Icon: MapPin, color: '#34A853' },
	{ id: 'moovit', label: 'Moovit', Icon: Bus, color: '#F26B21' },
];

function useWide() {
	const [wide, setWide] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		const sync = () => setWide(mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);
	return wide;
}

/** One "Directions" button. Opens a bottom sheet (popover from 768px) with Waze, Google Maps and Moovit. */
export function DirectionsMenu({ venue, transitFirst }: { venue: Venue; transitFirst: boolean }) {
	const { t } = useT();
	const [open, setOpen] = useState(false);
	const wide = useWide();
	const wrapRef = useRef<HTMLDivElement>(null);
	const links = venueLinks(venue);
	const order = transitFirst ? [APPS[2], APPS[0], APPS[1]] : APPS;

	useEffect(() => {
		if (!open || !wide) return;
		const onDown = (e: PointerEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open, wide]);

	const rows = (
		<ul className="flex flex-col">
			{order.map((a) => (
				<li key={a.id}>
					<a
						href={links[a.id]}
						target="_blank"
						rel="noopener noreferrer"
						onClick={() => setOpen(false)}
						className="flex min-h-14 w-full items-center gap-3 border-b border-border px-1 text-body font-medium hover:bg-surface-2"
					>
						<span className="grid size-6 place-items-center rounded-sm" style={{ background: a.color }} aria-hidden="true">
							<a.Icon className="size-4 text-[#FFFFFF]" />
						</span>
						{a.label}
						<span className="sr-only">{t('opensNewTab')}</span>
					</a>
				</li>
			))}
			<li>
				<button type="button" onClick={() => setOpen(false)} className="flex min-h-14 w-full items-center px-1 text-body text-muted-foreground">
					{t('cancel')}
				</button>
			</li>
		</ul>
	);

	return (
		<div ref={wrapRef} className="relative flex-1">
			<button
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="h-12 w-full rounded-sm bg-surface-2 text-body font-medium text-foreground"
			>
				{t('directions')}
			</button>
			{wide ? (
				open && (
					<div role="dialog" aria-label={t('openIn')} className="absolute start-0 top-full z-30 mt-1 w-72 rounded-lg border border-border bg-surface px-3 pt-2">
						<p className="pb-1 text-small text-muted-foreground">{t('openIn')}</p>
						{rows}
					</div>
				)
			) : (
				<Sheet open={open} title={t('openIn')} onClose={() => setOpen(false)}>
					{rows}
				</Sheet>
			)}
		</div>
	);
}
