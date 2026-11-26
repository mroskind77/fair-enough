import { Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { GeoError, PROVIDER_ATTRIBUTION, suggest, type Suggestion } from '@/lib/geo-client';
import { useT } from '@/lib/i18n';
import type { Place } from '@/lib/plan-store';

type Status = 'idle' | 'short' | 'loading' | 'ready' | 'empty' | 'busy' | 'failed';

interface Props {
	label: string;
	text: string;
	picked: boolean;
	onText: (text: string) => void;
	onPick: (place: Place) => void;
}

export function PlaceAutocomplete({ label, text, picked, onText, onPick }: Props) {
	const { t, lang } = useT();
	const inputId = useId();
	const listId = useId();
	const [status, setStatus] = useState<Status>('idle');
	const [results, setResults] = useState<Suggestion[]>([]);
	const [provider, setProvider] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const reqId = useRef(0);
	const typed = useRef(false);
	// A finger or mouse is down on the list: the input's blur must not close it before the tap lands.
	const pressing = useRef(false);
	const downAt = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		if (!typed.current || picked) return;
		const q = text.trim();
		if (q.length < 3) {
			setStatus(q.length ? 'short' : 'idle');
			setResults([]);
			return;
		}
		const id = ++reqId.current;
		setStatus('loading');
		const timer = setTimeout(() => {
			suggest(q, lang)
				.then((res) => {
					if (id !== reqId.current) return;
					setResults(res.results);
					setProvider(res.provider);
					setActive(-1);
					setStatus(res.results.length ? 'ready' : 'empty');
				})
				.catch((e: unknown) => {
					if (id !== reqId.current) return;
					setResults([]);
					setStatus(e instanceof GeoError && e.kind === 'busy' ? 'busy' : 'failed');
				});
		}, 400);
		return () => clearTimeout(timer);
	}, [text, lang, picked]);

	/**
	 * The list closes as soon as a suggestion is chosen, so the click the browser sends right after the tap would land
	 * on whatever sits underneath ("Add someone"). Swallow that one click.
	 */
	const swallowNextClick = () => {
		const stop = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		};
		document.addEventListener('click', stop, { capture: true, once: true });
		setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 700);
	};

	const choose = (s: Suggestion) => {
		typed.current = false;
		onPick({ label: s.label, sublabel: s.sublabel, lat: s.lat, lon: s.lon, provider: provider ?? 'unknown' });
		setOpen(false);
		setResults([]);
		setStatus('idle');
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open || results.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActive((a) => (a + 1) % results.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(results[active >= 0 ? active : 0]);
		} else if (e.key === 'Escape') {
			setOpen(false);
		}
	};

	const message =
		status === 'short'
			? t('typeMore')
			: status === 'empty'
				? t('noMatches')
				: status === 'busy'
					? t('busy')
					: status === 'failed'
						? t('suggestFailed')
						: null;
	const attribution = provider ? PROVIDER_ATTRIBUTION[provider] : null;
	const showPanel = open && !picked && (status === 'loading' || status === 'ready' || message);

	return (
		// Own stacking context above the map (which is isolated at z-0), so map pins never draw over the suggestions.
		<div className={`relative isolate flex-1 ${showPanel ? 'z-40' : 'z-10'}`}>
			<label htmlFor={inputId} className="sr-only">
				{label}
			</label>
			<div className="relative">
				<input
					id={inputId}
					dir="auto"
					type="text"
					inputMode="search"
					autoComplete="off"
					spellCheck={false}
					role="combobox"
					aria-expanded={Boolean(showPanel)}
					aria-controls={listId}
					aria-autocomplete="list"
					aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
					placeholder={t('fromPlaceholder')}
					value={text}
					onChange={(e) => {
						typed.current = true;
						onText(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() =>
						setTimeout(() => {
							if (!pressing.current) setOpen(false);
						}, 150)
					}
					onKeyDown={onKeyDown}
					className={`min-h-12 w-full rounded-sm border bg-surface px-3 text-body outline-none placeholder:text-muted-foreground focus:border-ink ${
						picked ? 'border-border' : text ? 'border-warn' : 'border-border'
					}`}
				/>
				{status === 'loading' && (
					<Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
				)}
			</div>
			{showPanel && (
				<div
					className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface"
					onPointerDown={(e) => {
						// Nothing under the list gets this press; the input keeps focus.
						e.preventDefault();
						e.stopPropagation();
						pressing.current = true;
						downAt.current = { x: e.clientX, y: e.clientY };
					}}
					onPointerUp={(e) => {
						e.stopPropagation();
						pressing.current = false;
					}}
					onPointerCancel={() => {
						pressing.current = false;
						downAt.current = null;
					}}
					onMouseDown={(e) => e.preventDefault()}
					onClick={(e) => e.stopPropagation()}
				>
					{status === 'loading' && <p className="px-3 py-3 text-sm text-muted-foreground">{t('searching')}</p>}
					{message && (
						<p className="px-3 py-3 text-sm text-muted-foreground" role="status">
							{message}
						</p>
					)}
					{status === 'ready' && (
						<ul id={listId} role="listbox" aria-label={label}>
							{results.map((s, i) => (
								<li
									key={s.id}
									id={`${listId}-${i}`}
									role="option"
									aria-selected={i === active}
									onPointerUp={(e) => {
										// A tap (not a drag) picks the place right away, before any blur can close the list.
										const d = downAt.current;
										downAt.current = null;
										pressing.current = false;
										if (e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
										e.preventDefault();
										e.stopPropagation();
										swallowNextClick();
										choose(s);
									}}
									onClick={(e) => {
										// Keyboard / assistive-tech activation (no pointer events before it).
										e.stopPropagation();
										if (e.detail === 0) choose(s);
									}}
									className={`flex min-h-11 cursor-pointer flex-col justify-center border-b border-border px-3 py-2 last:border-b-0 ${
										i === active ? 'bg-surface-2' : 'hover:bg-surface-2'
									}`}
								>
									<span className="text-body font-medium">
										<span dir="auto">{s.label}</span>
									</span>
									{s.sublabel && (
										<span className="text-small text-muted-foreground">
											<span dir="auto">{s.sublabel}</span>
										</span>
									)}
								</li>
							))}
						</ul>
					)}
					{status === 'ready' && attribution && (
						<p className="border-t border-border px-3 py-1.5 text-micro font-medium text-muted-foreground">
							{t('via')}{' '}
							<a href={attribution.href} target="_blank" rel="noreferrer" className="underline" dir="ltr">
								{attribution.text}
							</a>
						</p>
					)}
				</div>
			)}
		</div>
	);
}
