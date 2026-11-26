import { Check } from 'lucide-react';

import { useT } from '@/lib/i18n';
import type { Chip as ChipT } from '@/lib/chips';

export function ChipToggle({ chip, selected, onToggle }: { chip: ChipT; selected: boolean; onToggle: () => void }) {
	const { t, lang } = useT();
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onToggle}
			className={`inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3.5 text-small font-medium transition-colors ${
				selected ? 'bg-ink text-on-ink' : 'bg-surface-2 text-foreground'
			}`}
		>
			{selected && <Check className="size-3.5" aria-hidden="true" />}
			<span>{lang === 'he' ? chip.he : chip.en}</span>
			{chip.few && (
				<span className={`text-micro ${selected ? '' : 'text-muted-foreground'}`}>· {t('fewListed')}</span>
			)}
		</button>
	);
}
