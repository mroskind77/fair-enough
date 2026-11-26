import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '@/lib/i18n';

/** ⓘ next to the kosher switch and every kosher label. Tap to open (works on touch). */
export function KosherInfo() {
	const { t } = useT();
	const [open, setOpen] = useState(false);
	const id = useId();
	const ref = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('pointerdown', onDown);
		return () => document.removeEventListener('pointerdown', onDown);
	}, [open]);

	return (
		<span ref={ref} className="relative inline-flex">
			<button
				type="button"
				aria-label={t('kosherInfo')}
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen((v) => !v)}
				className="grid size-11 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
			>
				<Info className="size-4" aria-hidden="true" />
			</button>
			{open && (
				<span
					id={id}
					role="note"
					className="absolute top-full end-0 z-20 w-72 max-w-[80vw] rounded-lg border border-border bg-surface p-3 text-small text-pretty text-foreground"
				>
					{t('kosherTooltip')}
				</span>
			)}
		</span>
	);
}
