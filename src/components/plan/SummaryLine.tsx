import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SheetName } from '@/components/plan/Sheets';
import { CHIP_BY_ID } from '@/lib/chips';
import { useT } from '@/lib/i18n';
import { usePlan } from '@/lib/plan-store';
import { formatWhen } from '@/lib/time';

function Item({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-haspopup="dialog"
			className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-4 py-2 text-start last:border-b-0 hover:bg-surface-2/60"
		>
			<span className="w-28 shrink-0 text-body text-muted-foreground">{label}</span>
			<span className="flex-1 truncate text-body font-medium">{children}</span>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
		</button>
	);
}

export function SummaryLine({ onOpen }: { onOpen: (s: SheetName) => void }) {
	const { t, lang } = useT();
	const { plan, ready } = usePlan();
	const d = plan.durationMin;
	const durationText = [30, 60, 120, 180].includes(d) ? t(`durationLabel_${d as 30 | 60 | 120 | 180}`) : t('minutes', { n: d });
	const chipNames = plan.chips.map((id) => CHIP_BY_ID[id]).filter(Boolean).map((c) => (lang === 'he' ? c.he : c.en));

	return (
		<div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
			<Item label={t('meetAt')} onClick={() => onOpen('when')}>
				{ready && plan.meetAt ? (
					<>
						<bdi className="num">{formatWhen(plan.meetAt, lang)}</bdi>
					</>
				) : (
					<span className="text-muted-foreground">…</span>
				)}
			</Item>
			<Item label={t('for')} onClick={() => onOpen('when')}>
				<bdi className="num">{durationText}</bdi>
			</Item>
			<Item label={t('occasion')} onClick={() => onOpen('occasion')}>
				{t(`occ_${plan.occasion}`)}
			</Item>
			<Item label={t('what')} onClick={() => onOpen('what')}>
				{chipNames.length === 0 ? (
					<span className="text-warn">{t('pickAtLeastOne')}</span>
				) : (
					<>
						{chipNames.slice(0, 2).join(', ')}
						{chipNames.length > 2 && <span className="text-muted-foreground"> {t('moreCount', { n: chipNames.length - 2 })}</span>}
					</>
				)}
			</Item>
			<Item label={t('kosher')} onClick={() => onOpen('kosher')}>
				{plan.kosher ? t('kosherOn') : t('kosherOff')}
			</Item>
		</div>
	);
}
