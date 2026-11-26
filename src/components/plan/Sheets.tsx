import { useState } from 'react';

import { ChipToggle } from '@/components/plan/Chip';
import { KosherInfo } from '@/components/KosherInfo';
import { Sheet } from '@/components/Sheet';
import { CHIPS, DURATIONS, OCCASION_DEFAULTS, type Occasion } from '@/lib/chips';
import { useT } from '@/lib/i18n';
import { usePlan } from '@/lib/plan-store';
import { isPast, israelNow } from '@/lib/time';

export type SheetName = 'when' | 'occasion' | 'what' | 'kosher' | null;

const fieldCls =
	'num min-h-12 w-full rounded-sm border border-border bg-surface px-3 text-body outline-none focus:border-ink';

const segBtn = (on: boolean) =>
	`min-h-11 rounded-sm px-3 text-small font-medium ${on ? 'bg-ink text-on-ink' : 'bg-surface-2 text-foreground'}`;

function DoneButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
	const { t } = useT();
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="mt-6 h-13 w-full rounded-sm bg-ink font-medium text-on-ink disabled:bg-surface-2 disabled:text-muted-foreground"
		>
			{t('done')}
		</button>
	);
}

function WhenSheet({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const { plan, update } = usePlan();
	const [date, setDate] = useState(plan.meetAt?.slice(0, 10) ?? '');
	const [time, setTime] = useState(plan.meetAt?.slice(11, 16) ?? '');
	const isCustom = !(DURATIONS as readonly number[]).includes(plan.durationMin);
	const [custom, setCustom] = useState(isCustom ? String(plan.durationMin) : '');
	const [showCustom, setShowCustom] = useState(isCustom);
	const value = date && time ? `${date}T${time}` : '';
	const past = value ? isPast(value, israelNow()) : false;
	const customNum = Number(custom);
	const customBad = showCustom && (!Number.isInteger(customNum) || customNum < 15 || customNum > 720);

	const save = () => {
		update((p) => ({ ...p, meetAt: value || p.meetAt, durationMin: showCustom && !customBad ? customNum : p.durationMin }));
		onClose();
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-2 gap-3">
				<label className="flex flex-col gap-1 text-sm font-semibold">
					{t('date')}
					<input type="date" dir="ltr" value={date} min={israelNow().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
				</label>
				<label className="flex flex-col gap-1 text-sm font-semibold">
					{t('time')}
					<input type="time" dir="ltr" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={fieldCls} />
				</label>
			</div>
			<p className="text-xs text-muted-foreground">{t('whenHint')}</p>
			{past && (
				<p className="text-small text-warn" role="alert">
					{t('pastTime')}
				</p>
			)}
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 text-sm font-semibold">{t('for')}</legend>
				<div className="flex flex-wrap gap-2">
					{DURATIONS.map((d) => (
						<button
							key={d}
							type="button"
							aria-pressed={!showCustom && plan.durationMin === d}
							onClick={() => {
								setShowCustom(false);
								update((p) => ({ ...p, durationMin: d }));
							}}
							className={segBtn(!showCustom && plan.durationMin === d)}
						>
							{t(`durationLabel_${d}`)}
						</button>
					))}
					<button type="button" aria-pressed={showCustom} onClick={() => setShowCustom(true)} className={segBtn(showCustom)}>
						{t('custom')}
					</button>
				</div>
				{showCustom && (
					<label className="mt-2 flex flex-col gap-1 text-sm">
						{t('customMinutes')}
						<input type="number" inputMode="numeric" dir="ltr" min={15} max={720} value={custom} onChange={(e) => setCustom(e.target.value)} className={fieldCls} />
					</label>
				)}
			</fieldset>
			<DoneButton onClick={save} disabled={!value || past || customBad} />
		</div>
	);
}

function OccasionSheet({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const { plan, update } = usePlan();
	const [undo, setUndo] = useState<{ occasion: Occasion; chips: string[] } | null>(null);

	const pick = (o: Occasion) => {
		if (o === plan.occasion) return;
		setUndo({ occasion: plan.occasion, chips: plan.chips });
		update((p) => ({ ...p, occasion: o, chips: [...OCCASION_DEFAULTS[o]] }));
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap gap-2" role="group" aria-label={t('occasion')}>
				{(['date', 'friends', 'family'] as Occasion[]).map((o) => (
					<button key={o} type="button" aria-pressed={plan.occasion === o} onClick={() => pick(o)} className={segBtn(plan.occasion === o)}>
						{t(`occ_${o}`)}
					</button>
				))}
			</div>
			<p className="text-sm text-muted-foreground text-pretty">{t('occasionHint')}</p>
			{undo && (
				<p className="flex items-center gap-3 rounded-sm bg-surface-2 px-3 py-2 text-small" role="status">
					<span>{t('occasionChanged', { occasion: t(`occ_${plan.occasion}`) })}</span>
					<button
						type="button"
						onClick={() => {
							update((p) => ({ ...p, occasion: undo.occasion, chips: undo.chips }));
							setUndo(null);
						}}
						className="min-h-11 font-medium underline underline-offset-2"
					>
						{t('undo')}
					</button>
				</p>
			)}
			<DoneButton onClick={onClose} />
		</div>
	);
}

function WhatSheet({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const { plan, update } = usePlan();
	const toggle = (id: string) =>
		update((p) => ({ ...p, chips: p.chips.includes(id) ? p.chips.filter((c) => c !== id) : [...p.chips, id] }));

	return (
		<div className="flex flex-col gap-5">
			{(['eat', 'do'] as const).map((g) => (
				<section key={g} className="flex flex-col gap-2">
					<h3 className="text-sm font-semibold">{g === 'eat' ? t('eatDrink') : t('doSomething')}</h3>
					<div className="flex flex-wrap gap-2">
						{CHIPS.filter((c) => c.group === g).map((c) => (
							<ChipToggle key={c.id} chip={c} selected={plan.chips.includes(c.id)} onToggle={() => toggle(c.id)} />
						))}
					</div>
				</section>
			))}
			<p className="text-xs text-muted-foreground">{t('fewLegend')}</p>
			{plan.chips.length === 0 && (
				<p className="text-small text-warn" role="alert">
					{t('pickAtLeastOne')}
				</p>
			)}
			<DoneButton onClick={onClose} disabled={plan.chips.length === 0} />
		</div>
	);
}

function KosherSheet({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const { plan, update } = usePlan();
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<div className="flex gap-2" role="radiogroup" aria-label={t('kosher')}>
					{[false, true].map((v) => (
						<button
							key={String(v)}
							type="button"
							role="radio"
							aria-checked={plan.kosher === v}
							onClick={() => update((p) => ({ ...p, kosher: v }))}
							className={segBtn(plan.kosher === v)}
						>
							{v ? t('kosherOn') : t('kosherOff')}
						</button>
					))}
				</div>
				<KosherInfo />
			</div>
			<p className="text-sm text-pretty">{t('kosherTooltip')}</p>
			<p className="text-sm text-muted-foreground">{t('kosherFoodOnly')}</p>
			<DoneButton onClick={onClose} />
		</div>
	);
}

export function PlanSheets({ open, onClose }: { open: SheetName; onClose: () => void }) {
	const { t } = useT();
	const titles = { when: t('meetAt'), occasion: t('occasion'), what: t('what'), kosher: t('kosher') };
	return (
		<Sheet open={open !== null} title={open ? titles[open] : ''} onClose={onClose}>
			{open === 'when' && <WhenSheet onClose={onClose} />}
			{open === 'occasion' && <OccasionSheet onClose={onClose} />}
			{open === 'what' && <WhatSheet onClose={onClose} />}
			{open === 'kosher' && <KosherSheet onClose={onClose} />}
		</Sheet>
	);
}
