import { Link } from '@tanstack/react-router';

import { PageShell } from '@/components/PageShell';
import { useT } from '@/lib/i18n';

/** Default fallback for URLs that do not match a route. */
export function DefaultNotFoundPage() {
	const { t } = useT();
	return (
		<PageShell>
			<div className="flex flex-col gap-4 py-10">
				<h1 className="text-title font-bold text-balance">{t('notFoundTitle')}</h1>
				<p className="text-muted-foreground">{t('notFoundBody')}</p>
				<Link to="/" className="inline-flex min-h-12 items-center self-start h-13 rounded-sm bg-ink px-5 font-medium text-on-ink">
					{t('goHome')}
				</Link>
			</div>
		</PageShell>
	);
}
