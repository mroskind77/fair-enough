import { Link, useRouter } from '@tanstack/react-router';

import { PageShell } from '@/components/PageShell';
import { useT } from '@/lib/i18n';

/**
 * Default fallback for route failures that do not provide their own error component.
 * Keep visitor-facing content generic and never render raw internal error details.
 */
export function DefaultErrorPage() {
	const router = useRouter();
	const { t } = useT();

	const recoverPage = () => {
		void router.invalidate();
	};

	return (
		<PageShell>
			<div className="flex flex-col gap-4 py-10">
				<h1 className="text-title font-bold text-balance">{t('errorTitle')}</h1>
				<p className="text-muted-foreground">{t('errorBody')}</p>
				<div className="flex flex-wrap items-center gap-3">
					<button className="h-13 rounded-sm bg-ink px-5 font-medium text-on-ink" type="button" onClick={recoverPage}>
						{t('tryAgain')}
					</button>
					<Link to="/" className="min-h-12 content-center px-2 font-medium underline underline-offset-2">
						{t('goHome')}
					</Link>
				</div>
			</div>
		</PageShell>
	);
}
