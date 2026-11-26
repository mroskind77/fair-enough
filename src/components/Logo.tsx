import { useId } from 'react';

/**
 * Fair Enough B2 mark (from the brand package in src/assets/brand). Two equal routes, rotationally symmetric,
 * blue on top, orange below. Colours follow light/dark through --fe-logo-* (custom.css). Never mirrored in RTL.
 */
const ROUTE = 'M 23 27 H 44 C 69 27 82 48 64 64 C 46 80 59 101 84 101 H 105';

/** Outlined "fair enough" wordmark glyphs from lockup-color.svg: [transform, path]. */
const GLYPHS: [string, string][] = [
	['translate(0 0)', 'M675 1056H460V1168C460 1254 492 1287 578 1287H675V1490H528C319 1490 207 1392 207 1210V1056H17V853H207V0H460V853H675Z'],
	['translate(703 0)', 'M434 -17C606 -17 695 55 745 149H749V0H997V720C997 940 834 1077 559 1077C283 1077 111 938 99 728H342C349 817 431 881 554 881C675 881 747 817 747 727V719C747 647 680 644 484 622C266 599 69 540 69 300C69 89 224 -17 434 -17ZM496 170C386 170 315 219 315 302C315 398 407 437 515 453C619 469 717 485 748 505V391C748 268 661 170 496 170Z'],
	['translate(1799 0)', 'M112 0H364V1056H112ZM238 1213C324 1213 389 1275 389 1357C389 1438 324 1500 238 1500C152 1500 87 1438 87 1357C87 1275 152 1213 238 1213Z'],
	['translate(2263 0)', 'M112 0H364V598C364 763 457 846 577 846C627 846 677 841 696 838V1062C676 1064 648 1066 614 1066C478 1066 397 1002 358 881H355V1056H112Z'],
	['translate(3431 0)', 'M578 -24C825 -24 1021 119 1061 326H825C796 236 711 175 584 175C414 175 316 290 310 462H1074V531C1074 855 872 1080 568 1080C272 1080 63 848 63 527C63 207 261 -24 578 -24ZM312 636C329 787 426 880 572 880C718 880 816 787 832 636Z'],
	['translate(4552 0)', 'M364 597C364 777 463 856 595 856C730 856 808 775 808 620V0H1061V660C1061 931 905 1077 684 1077C539 1077 432 1013 360 894V1056H112V0H364Z'],
	['translate(5713 0)', 'M584 -24C895 -24 1105 199 1105 527C1105 855 895 1080 584 1080C273 1080 63 855 63 527C63 199 273 -24 584 -24ZM584 187C421 187 318 316 318 527C318 739 422 869 584 869C745 869 849 738 849 527C849 317 746 187 584 187Z'],
	['translate(6868 0)', 'M488 -21C634 -21 741 43 813 162V0H1061V1056H808V459C808 279 710 200 577 200C442 200 364 281 364 436V1056H112V396C112 125 267 -21 488 -21Z'],
	['translate(8029 0)', 'M591 -432C877 -432 1090 -300 1090 27V1056H841V899H840C770 1020 655 1077 518 1077C247 1077 63 854 63 533C63 215 244 -7 520 -7C659 -7 771 49 839 173H840V12C840 -150 749 -237 591 -237C473 -237 386 -189 362 -98H115C143 -303 312 -432 591 -432ZM579 201C423 201 318 320 318 536C318 751 423 871 579 871C744 871 852 739 852 536C852 333 744 201 579 201Z'],
	['translate(9219 0)', 'M364 597C364 777 463 856 595 856C730 856 808 775 808 620V0H1061V660C1061 931 905 1077 684 1077C542 1077 436 1016 364 901V1490H112V0H364Z'],
];

function Symbol({ clipId }: { clipId: string }) {
	return (
		<>
			<defs>
				<clipPath id={clipId}>
					<path d="M0 0H128V64H0Z" />
				</clipPath>
			</defs>
			<path d={ROUTE} fill="none" stroke="var(--fe-logo-b)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
			<g clipPath={`url(#${clipId})`}>
				<path d={ROUTE} fill="none" stroke="var(--fe-logo-a)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
			</g>
			<circle cx="23" cy="27" r="9" fill="var(--fe-logo-a)" />
			<circle cx="105" cy="101" r="9" fill="var(--fe-logo-b)" />
		</>
	);
}

export function LogoMark({ className = 'size-7' }: { className?: string }) {
	const clipId = useId();
	return (
		<svg viewBox="0 0 128 128" className={className} aria-hidden="true" focusable="false">
			<Symbol clipId={clipId} />
		</svg>
	);
}

/** Mark and wordmark lockup (356 x 100). The wordmark takes the text colour. */
export function Wordmark({ className = 'h-8 w-auto' }: { className?: string }) {
	const clipId = useId();
	return (
		<svg viewBox="0 0 356 100" className={className} role="img" aria-label="Fair Enough" focusable="false">
			<g transform="translate(0 2) scale(.75)">
				<Symbol clipId={clipId} />
			</g>
			<g transform="translate(106 17)">
				<g fill="currentColor" transform="translate(0 48) scale(0.02392578125 -0.02392578125)">
					{GLYPHS.map(([t, d]) => (
						<path key={t} transform={t} d={d} />
					))}
				</g>
			</g>
		</svg>
	);
}
