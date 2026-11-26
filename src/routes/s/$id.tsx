import { createFileRoute, Link } from '@tanstack/react-router';

import { PageShell } from '@/components/PageShell';
import { OG_IMAGE_META, pageHead } from '@/config/app-head';
import { useT } from '@/lib/i18n';

// Share pages: the real snapshot load arrives in M5. `/s/test` is the temporary M0 probe
// that checks WhatsApp sees server-rendered preview tags.
export const Route = createFileRoute('/s/$id')({
	loader: ({ params }) => ({ probe: params.id === 'test' }),
	head: ({ loaderData, params }) => {
		if (loaderData?.probe) {
			return {
				meta: [
					{ title: 'probe-ok' },
					{ name: 'robots', content: 'noindex' },
					{ property: 'og:title', content: 'probe-ok' },
					{ property: 'og:description', content: 'נפגשים ב-14:30 · Fair Enough SSR probe' },
					{ property: 'og:type', content: 'website' },
					...OG_IMAGE_META,
					{ name: 'twitter:card', content: 'summary_large_image' },
				],
			};
		}
		return pageHead({ title: 'Shared plan · Fair Enough', description: 'A shared Fair Enough plan.', path: `/s/${params.id}`, noindex: true });
	},
	component: SharedPlan,
});

function SharedPlan() {
	const { t } = useT();
	const { probe } = Route.useLoaderData();
	return (
		<PageShell>
			<h1 className="text-title font-bold">{probe ? 'probe-ok' : t('sharedTitle')}</h1>
			<p className="mt-3 text-muted-foreground">{probe ? 'Server-rendered share route is working.' : t('planEnded')}</p>
			<Link to="/" className="mt-6 inline-flex min-h-12 items-center h-13 rounded-sm bg-ink px-5 font-medium text-on-ink">
				{t('planYourOwn')}
			</Link>
		</PageShell>
	);
}
