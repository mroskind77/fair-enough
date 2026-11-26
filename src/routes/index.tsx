import { createFileRoute } from '@tanstack/react-router';

import { pageHead } from '@/config/app-head';
import { PageShell } from '@/components/PageShell';
import { PlanForm } from '@/components/plan/PlanForm';
import { translate, useT } from '@/lib/i18n';

export const Route = createFileRoute('/')({
	head: ({ match }) => {
		const lang = match.context.prefs.lang;
		return pageHead({ title: `Fair Enough · ${translate(lang, 'pageTitleHome')}`, description: translate(lang, 'heroSub'), path: '/' });
	},
	component: Index,
});

function Index() {
	const { t } = useT();
	return (
		<PageShell>
			<div className="flex flex-col gap-2">
				<h1 className="text-display font-extrabold text-balance">{t('heroTitle')}</h1>
				<p className="text-body text-muted-foreground text-pretty">{t('heroSub')}</p>
			</div>
			<div className="mt-6">
				<PlanForm />
			</div>
		</PageShell>
	);
}
