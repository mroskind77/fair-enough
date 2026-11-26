import { Bus, Car, Footprints, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useT } from '@/lib/i18n';
import { MODES, type Mode } from '@/lib/plan-store';

export const MODE_ICON: Record<Mode, LucideIcon> = { car: Car, transit: Bus, walk: Footprints };

/** Tap cycles car → transit → walk. Long-press (or right-click) opens a menu. */
export function ModeButton({ mode, personName, onChange }: { mode: Mode; personName: string; onChange: (m: Mode) => void }) {
	const { t } = useT();
	const [menuOpen, setMenuOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressed = useRef(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const Icon = MODE_ICON[mode];

	useEffect(() => {
		if (!menuOpen) return;
		const onDown = (e: PointerEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [menuOpen]);

	const clear = () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	};

	return (
		<div ref={wrapRef} className="relative">
			<button
				type="button"
				aria-label={t('modeLabel', { mode: t(`mode_${mode}`) })}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onPointerDown={() => {
					longPressed.current = false;
					clear();
					timer.current = setTimeout(() => {
						longPressed.current = true;
						setMenuOpen(true);
					}, 500);
				}}
				onPointerUp={clear}
				onPointerLeave={clear}
				onContextMenu={(e) => {
					e.preventDefault();
					clear();
					longPressed.current = true;
					setMenuOpen(true);
				}}
				onClick={() => {
					if (longPressed.current) {
						longPressed.current = false;
						return;
					}
					onChange(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
				}}
				className="grid size-12 shrink-0 select-none place-items-center rounded-sm bg-surface-2 text-foreground"
			>
				<Icon className="size-5" aria-hidden="true" />
			</button>
			{menuOpen && (
				<div role="menu" aria-label={t('modeMenu', { name: personName })} className="absolute end-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface">
					{MODES.map((m) => {
						const MIcon = MODE_ICON[m];
						return (
							<button
								key={m}
								type="button"
								role="menuitemradio"
								aria-checked={m === mode}
								onClick={() => {
									onChange(m);
									setMenuOpen(false);
								}}
								className={`flex min-h-11 w-full items-center gap-3 px-3 text-start text-sm hover:bg-surface-2 ${m === mode ? 'font-bold' : ''}`}
							>
								<MIcon className="size-4" aria-hidden="true" />
								{t(`modeName_${m}`)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
