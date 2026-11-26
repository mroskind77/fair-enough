import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { useT } from '@/lib/i18n';

/** Bottom sheet. Uses dvh so it stays usable with the on-screen keyboard open. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
	const { t } = useT();
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const prev = document.activeElement as HTMLElement | null;
		panelRef.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
			prev?.focus();
		};
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex flex-col justify-end">
			<button type="button" aria-label={t('close')} className="absolute inset-0 bg-[#000000]/45" onClick={onClose} tabIndex={-1} />
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className="relative mx-auto flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-xl border border-b-0 border-border bg-surface outline-none"
			>
				<div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
					<h2 id={titleId} className="text-title font-bold">
						{title}
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label={t('close')}
						className="grid size-11 place-items-center rounded-sm hover:bg-surface-2"
					>
						<X className="size-5" aria-hidden="true" />
					</button>
				</div>
				<div className="overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
			</div>
		</div>
	);
}
