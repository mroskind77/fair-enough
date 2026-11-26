import { AlertTriangle, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { KosherInfo } from '@/components/KosherInfo';
import { ConvergenceLines, type LineState } from '@/components/results/ConvergenceLines';
import { DirectionsMenu } from '@/components/results/DirectionsMenu';
import { CHIP_BY_ID } from '@/lib/chips';
import { formatWeeklyHours } from '@/lib/hours';
import { useT, type TKey } from '@/lib/i18n';
import { roughTransit, venueNames, type FillStage, type Leg, type PerPerson, type Venue } from '@/lib/search-client';
import { addMinutes, closingTime, timeOf } from '@/lib/time';

function legKind(m: string): 'legBus' | 'legTrain' | 'legTram' | 'legOther' {
	if (m === 'BUS' || m === 'COACH') return 'legBus';
	if (m === 'TRAM' || m === 'SUBWAY' || m === 'METRO') return 'legTram';
	if (m.includes('RAIL') || m === 'LONG_DISTANCE' || m === 'TRAIN') return 'legTrain';
	return 'legOther';
}

/** Isolated so times and line numbers keep their order in RTL text. */
const iso = (s: string) => `\u2068${s}\u2069`;

export function ResultRow({
	venue,
	index,
	scale,
	showKosher,
	fill,
	onRetry,
	retrying,
	names,
	meetEnd,
	transitFirst,
	allTransit = false,
	selected = false,
	onSelect,
	homeState = 'idle',
}: {
	venue: Venue;
	index: number;
	scale: number;
	showKosher: boolean;
	/** Which fill-in pass is running for the rows on screen. */
	fill: FillStage;
	/** Ride home for this place (asked on tap, and by "Try again"). */
	onRetry: (id: string) => void;
	/** This row's real trips there are being fetched (it scrolled into view). */
	retrying: boolean;
	/** Ride-home check on tap: running, or failed (shows "Try again"). */
	homeState?: 'idle' | 'checking' | 'failed';
	names: string[];
	/** Meeting end, Israel local "YYYY-MM-DDTHH:MM". */
	meetEnd: string;
	transitFirst: boolean;
	/** Everyone goes by bus/train: the "checking" line names buses and trains. */
	allTransit?: boolean;
	/** Highlighted together with its map pin. */
	selected?: boolean;
	onSelect?: (id: string) => void;
}) {
	const { t, lang } = useT();
	const [showHours, setShowHours] = useState(false);
	const shown = venueNames(venue, lang);

	if (venue.dropped)
		return (
			<li id={`row-${venue.id}`} className="rounded-lg border border-border bg-surface px-4 py-3 text-small" aria-labelledby={`v-${venue.id}`}>
				<h3 id={`v-${venue.id}`} className="inline text-small">
					<span className="sr-only">{index + 1}. </span>
					<span dir="auto" className="text-muted-foreground line-through">
						{shown.name}
					</span>
				</h3>
				{' · '}
				<span>{t(`drop_${venue.dropped}`)}</span>
			</li>
		);

	const chip = CHIP_BY_ID[venue.chip];
	const name = (i: number) => names[i] ?? t(`person_${(Math.min(i, 2) + 1) as 1 | 2 | 3}`);

	const stateOf = (p: PerPerson): LineState => {
		if (roughTransit(p) && (fill === 'out' || retrying)) return 'checking';
		if (p.estimate) return 'estimate';
		return 'real';
	};

	const tripText = (p: PerPerson, i: number): string | null => {
		if (roughTransit(p)) return null;
		const leave =
			t('leaveByShort', { name: name(i), time: iso(timeOf(p.leaveBy)) }) +
			(p.early ? ` (${t('arrivesEarly', { n: iso(String(p.early)) })})` : '');
		if (p.mode !== 'transit' || !p.out) return leave;
		const rides = p.out.filter((l: Leg) => l.m !== 'WALK');
		if (!rides.length) return `${leave} · ${t('walkOnly')}`;
		const parts = rides.map((l, k) => {
			const kind = legKind(l.m);
			const label = kind === 'legBus' || kind === 'legTram' ? t(kind, { n: iso(l.line ?? '') }).trim() : `${t(kind)}${l.line ? ` ${iso(l.line)}` : ''}`;
			return k > 0 && lang === 'en' ? label.charAt(0).toLowerCase() + label.slice(1) : label;
		});
		return `${leave} · ${parts.join(lang === 'he' ? ` ${t('legThen')} ` : `, ${t('legThen')} `)}`;
	};

	const checking = venue.per.some((p) => roughTransit(p) && (fill === 'out' || retrying))
		? allTransit
			? 'checkingTripsAll'
			: 'checkingTrips'
		: homeState === 'checking'
			? 'checkingHomeTap'
			: null;
	/** Only after the tap check, and only for a rider it found has no ride home (never for missing data). */
	const homeWarnFor = (p: PerPerson) => p.mode === 'transit' && p.ride === 'none';
	const riders = venue.per.filter((p) => p.mode === 'transit').length;
	const homeUnasked =
		homeState === 'idle' && venue.per.some((p) => p.mode === 'transit' && p.ride !== 'ok' && p.ride !== 'none');

	let hoursLine: string | null = null;
	if (venue.hours === 'unknown') hoursLine = t('hoursUnknown');
	else if (venue.openTill === '24h') hoursLine = t('hours24');
	else if (venue.openTill)
		hoursLine =
			venue.openTill <= addMinutes(meetEnd, 30)
				? t('hoursSoon', { time: iso(closingTime(venue.openTill)) })
				: t('hoursOpen', { time: iso(closingTime(venue.openTill)) });
	const weekly = formatWeeklyHours(venue.hoursRaw, lang);
	const kosherKey: TKey | null =
		venue.kosher && (showKosher || venue.kosher === 'listed')
			? venue.kosher === 'listed'
				? 'kosherListed'
				: venue.kosher === 'not'
					? 'kosherNot'
					: 'kosherNone'
			: null;

	return (
		// Tapping the row highlights its pin on the map (buttons and links inside keep their own action).
		<li
			id={`row-${venue.id}`}
			onClick={() => onSelect?.(venue.id)}
			className={`flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-surface p-4 transition-shadow ${selected ? 'border-ink ring-2 ring-ink' : 'border-border'}`}
			aria-labelledby={`v-${venue.id}`}
			aria-current={selected ? 'true' : undefined}
		>
			<div className="flex items-start gap-3">
				<span className="num text-title font-bold text-muted-foreground" aria-hidden="true">
					{index + 1}
				</span>
				<div className="min-w-0 flex-1">
					<h3 id={`v-${venue.id}`} className="text-title font-bold text-balance">
						<span className="sr-only">{index + 1}. </span>
						<span dir="auto">{shown.name}</span>
					</h3>
					<p className="text-small text-muted-foreground">
						<span dir="auto">{chip ? chip[lang] : venue.chip}</span>
						{shown.altName && (
							<>
								{' · '}
								<span dir="auto">{shown.altName}</span>
							</>
						)}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end text-end">
					{venue.gap === 0 ? (
						<span className="text-title font-extrabold">{t('gapZero')}</span>
					) : (
						<>
							<span className="num text-hero-num font-extrabold">{venue.gap}</span>
							<span className="text-small text-muted-foreground">{t('gap')}</span>
						</>
					)}
				</div>
			</div>

			<ConvergenceLines
				label={t('perPerson')}
				scale={scale}
				lines={venue.per.map((p, i) => ({ minutes: p.minutes, name: name(i), state: stateOf(p) }))}
			/>

			<div className="num flex flex-col gap-0.5 text-small">
				{checking && (
					<p className="text-muted-foreground" role="status">
						{t(checking)}
					</p>
				)}
				{venue.per.map((p, i) => {
					const line = tripText(p, i);
					const warn = homeWarnFor(p);
					if (!line && !warn) return null;
					return (
						<div key={i} className="flex flex-col gap-0.5">
							{line && <p>{line}</p>}
							{warn && (
								<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-warn" role="status">
									<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
									<span>
										{riders > 1 && (
											<>
												<bdi>{name(i)}</bdi>:{' '}
											</>
										)}
										{t('homeNone')}
									</span>
								</p>
							)}
						</div>
					);
				})}
				{venue.per.map((p, i) =>
					p.mode === 'transit' && p.ride === 'ok' && p.lastHome ? (
						<p key={`h${i}`}>
							{riders > 1 ? `${name(i)}: ` : ''}
							{t('rideHome', { time: iso(timeOf(p.lastHome)) })}
						</p>
					) : null,
				)}
				{homeState === 'failed' && (
					<p className="flex flex-wrap items-center gap-x-2 text-muted-foreground" role="status">
						<span>{t('homeCheckFailed')}</span>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onRetry(venue.id);
							}}
							className="min-h-8 text-foreground underline underline-offset-2"
						>
							{t('tryAgainShort')}
						</button>
					</p>
				)}
				{homeUnasked && (
					<div>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onSelect?.(venue.id);
							}}
							className="min-h-8 text-muted-foreground underline underline-offset-2"
						>
							{t('checkHomeBtn')}
						</button>
					</div>
				)}
				{(hoursLine || kosherKey) && (
					<p className="flex flex-wrap items-center gap-x-1">
						{hoursLine && <span>{hoursLine}</span>}
						{hoursLine && kosherKey && <span aria-hidden="true">·</span>}
						{kosherKey && <span>{t(kosherKey)}</span>}
						{venue.kosher === 'listed' && kosherKey && <KosherInfo />}
					</p>
				)}
				{weekly && (
					<div>
						<button
							type="button"
							aria-expanded={showHours}
							onClick={() => setShowHours((v) => !v)}
							className="inline-flex min-h-8 items-center gap-1 text-muted-foreground underline underline-offset-2"
						>
							{t('hoursListed')}
							<ChevronDown className={`size-3.5 transition-transform ${showHours ? 'rotate-180' : ''}`} aria-hidden="true" />
						</button>
						{showHours && (
							<ul className="flex flex-col text-muted-foreground">
								{weekly.map((l) => (
									<li key={l}>{l}</li>
								))}
							</ul>
						)}
					</div>
				)}
			</div>

			<div className="flex gap-2">
				<DirectionsMenu venue={venue} transitFirst={transitFirst} />
				{venue.phone && (
					<a
						href={`tel:${venue.phone.replace(/[^\d+]/g, '')}`}
						className="inline-flex h-12 w-28 items-center justify-center rounded-sm bg-surface-2 text-body font-medium"
					>
						{venue.source === 'overture' ? t('callBefore') : t('call')}
					</a>
				)}
			</div>
		</li>
	);
}
