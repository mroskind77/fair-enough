import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { MapDebugPanel } from '@/components/MapDebugPanel';
import { getAppHead } from '@/config/app-head';
// CSS is linked as a stylesheet URL so it's in <head> on first SSR paint.
// @tailwindcss/vite processes it at build/dev time; the URL is stable across HMR.
import indexCss from '@/index.css?url';
import { readClientPrefs } from '@/lib/prefs';
import { AppProviders } from '@/providers/AppProviders';
import { getServerPrefs } from '@/server/prefs.functions';

export const Route = createRootRoute({
	// Language and theme are per visitor (cookie, else Accept-Language), so <html> lang/dir/theme
	// are rendered correctly on the server with no flash.
	beforeLoad: async () => ({
		prefs: typeof document === 'undefined' ? await getServerPrefs() : readClientPrefs(),
	}),
	head: () => {
		const appHead = getAppHead();

		return {
			...appHead,
			links: [...appHead.links, { rel: 'stylesheet', href: indexCss }],
		};
	},
	shellComponent: RootDocument,
	component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
	const { prefs } = Route.useRouteContext();

	return (
		<html
			lang={prefs.lang}
			dir={prefs.lang === 'he' ? 'rtl' : 'ltr'}
			data-theme={prefs.theme === 'system' ? undefined : prefs.theme}
		>
			<head>
				<HeadContent />
				<meta name="theme-color" content="#F4F5F7" media="(prefers-color-scheme: light)" />
				<meta name="theme-color" content="#0E1114" media="(prefers-color-scheme: dark)" />
			</head>
			<body className="bg-background font-sans text-foreground antialiased">
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	return (
		<AppProviders>
			{/* Child pages render here; without <Outlet /> no route below the root is shown. */}
			<Outlet />
			<MapDebugPanel />
		</AppProviders>
	);
}
