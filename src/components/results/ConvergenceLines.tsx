import { useEffect, useRef, useState } from 'react';

import { PersonMarker } from '@/components/PersonMarker';
import { useT } from '@/lib/i18n';
import { PERSON_COLORS } from '@/lib/plan-store';

export type LineState = 'estimate' | 'checking' | 'real';

export interface LineInfo {
	minutes: number;
	name: string;
	state: LineState;
}

const LABEL_W = 112;
const RING_R = 10;
const PAD = 4;

/**
 * One line per person, drawn to one scale for the whole page (the longest visible trip fills the track).
 * Lines run straight, then bend 45 degrees into a shared interchange ring at the inline end: person 1 from above,
 * person 2 from below, person 3 straight in. In RTL the whole graphic mirrors (lines come from the right).
 */
export function ConvergenceLines({ lines, scale, label }: { lines: LineInfo[]; scale: number; label: string }) {
	const { t } = useT();
	const estimateTip = t('estimateTip');
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(320);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const three = lines.length >= 3;
	const off = three ? 28 : 16;
	const H = off * 2 + 28;
	const cy = H / 2;
	const cx = w - RING_R - PAD;
	const track = Math.max(60, cx - LABEL_W);
	// Person 1 above, person 2 below, person 3 straight through the middle.
	const ys = [cy - off, cy + off, cy];

	return (
		<div ref={ref} className="relative w-full" style={{ height: H }} role="img" aria-label={label}>
			<svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="absolute inset-0 rtl:-scale-x-100" aria-hidden="true" focusable="false">
				{lines.map((l, i) => {
					const y = ys[i];
					const bend = Math.abs(y - cy);
					const len = Math.max(24 + bend, (Math.min(l.minutes, scale) / scale) * track);
					const x0 = cx - len;
					const d = bend ? `M${x0} ${y}H${cx - bend}L${cx} ${cy}` : `M${x0} ${y}H${cx}`;
					const dashed = l.state !== 'real';
					return (
						<path
							key={i}
							d={d}
							fill="none"
							stroke={PERSON_COLORS[i]}
							strokeWidth={dashed ? 3 : 4}
							strokeLinecap={dashed ? 'butt' : 'round'}
							strokeLinejoin="round"
							strokeDasharray={dashed ? '6 4' : undefined}
							className={l.state === 'checking' ? 'fe-march' : undefined}
						/>
					);
				})}
				<circle cx={cx} cy={cy} r={RING_R} fill="var(--fe-surface)" stroke="var(--fe-ink)" strokeWidth="3" />
			</svg>
			{lines.map((l, i) => {
				const y = ys[i];
				const bend = Math.abs(y - cy);
				const len = Math.max(24 + bend, (Math.min(l.minutes, scale) / scale) * track);
				const x0 = cx - len;
				return (
					<div
						key={i}
						className="absolute flex -translate-y-1/2 items-center gap-1.5"
						style={{ insetInlineEnd: w - x0 + 6, top: y, minHeight: 20, maxWidth: x0 - 6 }}
					>
						<span className="shrink-0 leading-none"><PersonMarker index={i} size={18} /></span>
						{/* Never cut: a long name wraps (and gets a little smaller) instead of ending in "…". */}
						<span
							dir="auto"
							className={`min-w-0 text-pretty break-words ${l.name.length > 8 ? 'text-[12px] leading-[13px]' : 'text-small'}`}
						>
							{l.name}
						</span>
						<span
							title={l.state === 'real' ? undefined : estimateTip}
							className={`num shrink-0 text-[15px] leading-5 font-bold ${l.state === 'real' ? 'text-foreground' : 'text-muted-foreground'}`}
						>
							{l.state === 'real' ? '' : '~'}
							{l.minutes}
						</span>
					</div>
				);
			})}
		</div>
	);
}
