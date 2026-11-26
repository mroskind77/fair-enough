import { PERSON_COLORS, PERSON_SHAPES } from '@/lib/plan-store';

/** Person marker: shape + number + colour, the same on input rows, result rows and map pins. */
export function PersonMarker({ index, size = 20 }: { index: number; size?: number }) {
	const shape = PERSON_SHAPES[index] ?? 'circle';
	const color = PERSON_COLORS[index];
	return (
		<svg viewBox="0 0 20 20" width={size} height={size} className="shrink-0" aria-hidden="true" focusable="false">
			{shape === 'circle' && <circle cx="10" cy="10" r="9" fill={color} />}
			{shape === 'square' && <rect x="1.5" y="1.5" width="17" height="17" rx="2" fill={color} />}
			{shape === 'diamond' && <rect x="3.6" y="3.6" width="12.8" height="12.8" rx="1.5" fill={color} transform="rotate(45 10 10)" />}
			<text x="10" y="14.2" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#FFFFFF" fontFamily="Rubik, system-ui, sans-serif">
				{index + 1}
			</text>
		</svg>
	);
}

/** Same shape as an HTML string for map pins (2px page-colour ring). */
export function personPinHtml(index: number): string {
	const shape = PERSON_SHAPES[index] ?? 'circle';
	const color = PERSON_COLORS[index];
	const inner =
		shape === 'circle'
			? `<circle cx="13" cy="13" r="11" fill="${color}" stroke="var(--fe-bg)" stroke-width="2"/>`
			: shape === 'square'
				? `<rect x="2" y="2" width="22" height="22" rx="3" fill="${color}" stroke="var(--fe-bg)" stroke-width="2"/>`
				: `<rect x="5" y="5" width="16" height="16" rx="2" fill="${color}" stroke="var(--fe-bg)" stroke-width="2" transform="rotate(45 13 13)"/>`;
	return `<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">${inner}<text x="13" y="17.5" text-anchor="middle" font-size="12" font-weight="700" fill="#FFFFFF" font-family="Rubik, system-ui, sans-serif">${index + 1}</text></svg>`;
}
