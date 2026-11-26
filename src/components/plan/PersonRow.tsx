import { Check, LocateFixed, Loader2, Pencil, X } from 'lucide-react';
import { useState } from 'react';

import { PersonMarker } from '@/components/PersonMarker';
import { ModeButton } from '@/components/plan/ModeButton';
import { PlaceAutocomplete } from '@/components/plan/PlaceAutocomplete';
import { reverse } from '@/lib/geo-client';
import { useT } from '@/lib/i18n';
import { usePersonName, usePlan, type Person } from '@/lib/plan-store';

export function PersonRow({ person, index, canRemove }: { person: Person; index: number; canRemove: boolean }) {
	const { t, lang } = useT();
	const { updatePerson, update, names, setName } = usePlan();
	const nameOf = usePersonName();
	const [locating, setLocating] = useState(false);
	const [locError, setLocError] = useState(false);
	const [locTapped, setLocTapped] = useState(false);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const name = nameOf(index);

	const useLocation = () => {
		setLocTapped(true);
		if (!('geolocation' in navigator)) {
			setLocError(true);
			return;
		}
		setLocating(true);
		setLocError(false);
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				const { latitude: lat, longitude: lon } = pos.coords;
				let area: string | null = null;
				try {
					area = (await reverse(lat, lon, lang)).area;
				} catch {
					area = null;
				}
				const label = area ? t('near', { area }) : t('myLocation');
				updatePerson(person.id, { text: label, place: { label, lat, lon, provider: 'device' } });
				setLocating(false);
			},
			() => {
				setLocating(false);
				setLocError(true);
			},
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
		);
	};

	const saveName = () => {
		setName(person.id, draft);
		setEditing(false);
	};

	return (
		<li className="flex flex-col gap-2 py-3">
			<div className="flex min-h-11 items-center justify-between gap-2">
				{editing ? (
					<span className="flex flex-1 items-center gap-2">
						<PersonMarker index={index} />
						<input
							autoFocus
							dir="auto"
							value={draft}
							maxLength={24}
							aria-label={t('addName')}
							placeholder={t(`person_${(index + 1) as 1 | 2 | 3}`)}
							onChange={(e) => setDraft(e.target.value)}
							onBlur={saveName}
							onKeyDown={(e) => {
								if (e.key === 'Enter') saveName();
								if (e.key === 'Escape') setEditing(false);
							}}
							className="h-11 min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 text-body outline-none focus:border-ink"
						/>
					</span>
				) : (
					<button
						type="button"
						onClick={() => {
							setDraft(names[person.id] ?? '');
							setEditing(true);
						}}
						aria-label={`${name}. ${t('addName')}`}
						className="-ms-1 flex min-h-11 items-center gap-2 rounded-sm px-1 text-body font-medium"
					>
						<PersonMarker index={index} />
						<span dir="auto">{name}</span>
						<Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" />
						{person.place && <Check className="size-4" aria-label={t('pickFromList')} />}
					</button>
				)}
				{canRemove && (
					<button
						type="button"
						onClick={() => update((p) => ({ ...p, people: p.people.filter((x) => x.id !== person.id) }))}
						aria-label={t('removePerson')}
						className="grid size-11 place-items-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
					>
						<X className="size-4" aria-hidden="true" />
					</button>
				)}
			</div>
			<div className="flex items-start gap-2">
				<PlaceAutocomplete
					label={`${name}: ${t('from')}`}
					text={person.text}
					picked={Boolean(person.place)}
					onText={(text) => updatePerson(person.id, { text, place: null })}
					onPick={(place) => updatePerson(person.id, { text: place.label, place })}
				/>
				<ModeButton mode={person.mode} personName={name} onChange={(mode) => updatePerson(person.id, { mode })} />
			</div>
			{index === 0 && (
				<div className="flex flex-col gap-1">
					<button
						type="button"
						onClick={useLocation}
						disabled={locating}
						className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium underline underline-offset-2 disabled:text-muted-foreground"
					>
						{locating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="size-4" aria-hidden="true" />}
						{locating ? t('locating') : t('useLocation')}
					</button>
					{locTapped && <p className="text-small text-muted-foreground">{t('locationNotice')}</p>}
					{locError && (
						<p className="flex items-center gap-1.5 text-small text-warn" role="alert">
							{t('locationFailed')}
						</p>
					)}
				</div>
			)}
		</li>
	);
}
