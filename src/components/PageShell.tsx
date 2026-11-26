import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 text-body">
				{children}
			</main>
			<SiteFooter />
		</div>
	);
}
