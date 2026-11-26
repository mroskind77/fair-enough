import { useNavigate } from '@tanstack/react-router';
import { Plus, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { MapView, type MapPin } from '@/components/MapView';
import { PersonRow } from '@/components/plan/PersonRow';
import { PlanSheets, type SheetName } from '@/components/plan/Sheets';
import { SummaryLine } from '@/components/plan/SummaryLine';
import { useT } from '@/lib/i18n';
import { usePersonName, usePlan } from '@/lib/plan-store';

export function PlanForm() {
	const { t } = useT();
	const navigate = useNavigate();
	const { plan, update } = usePlan();
	const [sheet, setSheet] = useState<SheetName>(null);
	const [online, setOnline] = useState(true);
	const nameOf = usePersonName();

	useEffect(() => {
		const sync = () => setOnline(navigator.onLine);
		sync();
		window.addEventListener('online', sync);
		window.addEventListener('offline', sync);
		return () => {
			window.removeEventListener('online', sync);
			window.removeEventListener('offline', sync);
		};
	}, []);

	const allPicked = plan.people.every((p) => p.place);
	const canSearch = allPicked && plan.chips.length > 0 && Boolean(plan.meetAt) && online;

	const pins = useMemo<MapPin[]>(
		() =>
			plan.people.flatMap((p, i) =>
				p.place ? [{ id: p.id, lat: p.place.lat, lon: p.place.lon, kind: 'person' as const, index: i, label: nameOf(i) }] : [],
			),
		[plan.people, nameOf],
	);

	return (
		<div className="flex flex-col gap-6">
			<section aria-labelledby="who" className="flex flex-col">
				<h2 id="who" className="sr-only">
					{t('from')}
				</h2>
				<ul className="flex flex-col">
					{plan.people.map((p, i) => (
						<PersonRow key={p.id} person={p} index={i} canRemove={i === 2} />
					))}
				</ul>
				{plan.people.length < 3 && (
					<button
						type="button"
						onClick={() => update((p) => ({ ...p, people: [...p.people, { id: 'p3', mode: 'car', text: '', place: null }] }))}
						className="inline-flex min-h-11 items-center gap-2 self-start text-body font-medium text-foreground underline underline-offset-2"
					>
						<Plus className="size-4" aria-hidden="true" />
						{t('addPerson')}
					</button>
				)}
			</section>

			{pins.length > 0 && <MapView pins={pins} label={t('mapLabel')} className="h-40" />}

			<SummaryLine onOpen={setSheet} />

			<div className="flex flex-col gap-2">
				{!online && (
					<p className="flex items-center gap-2 text-small text-warn" role="alert">
						<WifiOff className="size-4" aria-hidden="true" />
						{t('offline')}
					</p>
				)}
				<button
					type="button"
					disabled={!canSearch}
					aria-describedby={!allPicked ? 'search-needs' : undefined}
					onClick={() => void navigate({ to: '/results' })}
					className="h-13 w-full rounded-sm bg-ink text-body font-medium text-on-ink disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted-foreground"
				>
					{t('search')}
				</button>
				{!allPicked && (
					<p id="search-needs" className="text-small text-muted-foreground">
						{t('searchNeeds')}
					</p>
				)}
			</div>

			<PlanSheets open={sheet} onClose={() => setSheet(null)} />
		</div>
	);
}
