import type { AnyRouteMatch } from '@tanstack/react-router';
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?url';

// Defaults only; __root.tsx sets lang/dir per visitor from their saved language.
export const HTML_LANG = 'he';
export const HTML_DIR: 'ltr' | 'rtl' = 'rtl';

export const SITE_URL = 'https://fairenough.sticklight.app';
export const SITE_NAME = 'Fair Enough';
/** Share image. Absolute: WhatsApp, Facebook and others ignore a relative og:image. */
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
/** og:image plus its size, type and alt, so previews render on first share without a second fetch. */
export const OG_IMAGE_META: NonNullable<AnyRouteMatch['meta']> = [
	{ property: 'og:image', content: OG_IMAGE },
	{ property: 'og:image:secure_url', content: OG_IMAGE },
	{ property: 'og:image:type', content: 'image/png' },
	{ property: 'og:image:width', content: '1200' },
	{ property: 'og:image:height', content: '630' },
	{ property: 'og:image:alt', content: 'Fair Enough' },
	{ name: 'twitter:image', content: OG_IMAGE },
];

// Typed with the router's head entries so literals such as `crossOrigin: 'anonymous'` are not widened to `string`.
interface AppHead {
	meta: NonNullable<AnyRouteMatch['meta']>;
	links: NonNullable<AnyRouteMatch['links']>;
}

export function getAppHead(): AppHead {
	return {
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
			{ title: 'Fair Enough · The fair place to meet' },
			{
				name: 'description',
				content: 'Find a place in Israel that is fair for everyone: similar travel times, open the whole meeting, and a ride home.',
			},
			{ name: 'author', content: 'Fair Enough' },
			{ name: 'theme-color', content: '#F2EEE6', media: '(prefers-color-scheme: light)' },
			{ name: 'theme-color', content: '#14171A', media: '(prefers-color-scheme: dark)' },
			{ property: 'og:site_name', content: SITE_NAME },
			{ property: 'og:title', content: 'Fair Enough · The fair place to meet' },
			{ property: 'og:description', content: 'A fair place to meet in Israel, by car, bus or on foot.' },
			...OG_IMAGE_META,
			{ property: 'og:type', content: 'website' },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{ name: 'twitter:title', content: 'Fair Enough · The fair place to meet' },
			{ name: 'twitter:description', content: 'A fair place to meet in Israel, by car, bus or on foot.' },
		],
		links: [
			{ rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
			{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
			{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
			{ rel: 'manifest', href: '/site.webmanifest' },
			{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
			{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&display=swap',
			},
			{ rel: 'stylesheet', href: maplibreCss },
		],
	};
}

/** Per-page head entries: title, description, canonical, social tags. */
export function pageHead(opts: { title: string; description: string; path: string; noindex?: boolean }) {
	const url = new URL(opts.path, SITE_URL).href;
	const meta: NonNullable<AnyRouteMatch['meta']> = [
		{ title: opts.title },
		{ name: 'description', content: opts.description },
		{ property: 'og:title', content: opts.title },
		{ property: 'og:description', content: opts.description },
		{ property: 'og:url', content: url },
		{ property: 'og:type', content: 'website' },
		...OG_IMAGE_META,
		{ name: 'twitter:card', content: 'summary_large_image' },
	];
	if (opts.noindex) meta.push({ name: 'robots', content: 'noindex' });
	const links: NonNullable<AnyRouteMatch['links']> = [{ rel: 'canonical', href: url }];
	return { meta, links };
}
