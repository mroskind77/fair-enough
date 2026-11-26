import { createFileRoute } from '@tanstack/react-router';

import { PageShell } from '@/components/PageShell';
import { pageHead } from '@/config/app-head';
import type { Lang } from '@/lib/prefs';
import { usePrefs } from '@/lib/i18n';

export const Route = createFileRoute('/about')({
	head: ({ match }) =>
		pageHead({
			title: match.context.prefs.lang === 'he' ? 'אודות · Fair Enough' : 'About · Fair Enough',
			description:
				match.context.prefs.lang === 'he'
					? 'מאיפה המידע מגיע, מה אנחנו שומרים ומה לא, ורישיון הקוד הפתוח של Fair Enough.'
					: 'Where Fair Enough gets its data, what it keeps and what it does not, and its open-source licence.',
			path: '/about',
		}),
	component: About,
});

const SOURCES = [
	{ name: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright', en: 'Places, opening hours, kosher tags (ODbL).', he: 'מקומות, שעות פתיחה ותגיות כשרות (ODbL).' },
	{ name: 'OpenFreeMap', href: 'https://openfreemap.org', en: 'Map tiles.', he: 'אריחי המפה.' },
	{ name: 'Photon · Geoapify · LocationIQ · HeiGIT', href: 'https://photon.komoot.io', en: 'Address search, tried in that order.', he: 'חיפוש כתובות, לפי הסדר הזה.' },
	{ name: 'Hebcal', href: 'https://www.hebcal.com', en: 'Shabbat and holiday times (CC BY 4.0).', he: 'זמני שבת וחג (CC BY 4.0).' },
	{ name: 'Transitous', href: 'https://transitous.org/sources/', en: 'Bus and train schedules.', he: 'לוחות זמנים של אוטובוסים ורכבות.' },
];

// Fill in the repository name once the code is public.
const REPO_URL = 'https://github.com/mroskind77/fair-enough';
const LICENCE_NAME = 'MIT';
const TRANSITOUS_DONATE = 'https://transitous.org/donate/';

const COPY: Record<
	Lang,
	{ title: string; what: string; sources: string; privacyTitle: string; privacy: string[]; licenceTitle: string; licence: string; repo: string; donate: string; contactTitle: string; contact: string }
> = {
	en: {
		title: 'About Fair Enough',
		what: 'Fair Enough finds places in Israel where two or three people arrive in about the same time, that stay open for the whole meeting, and that have a ride home for anyone on public transport. It is free and open source.',
		sources: 'Where the data comes from',
		privacyTitle: 'Privacy',
		privacy: [
			'Starting addresses stay on your device. They never go in links or page addresses.',
			'Your location is used once to fill a field and is not saved.',
			'We count requests per connection to stop abuse, using a one-way code that changes daily. We never store IP addresses.',
			'Shared plans expire. Nobody can browse or list them.',
		],
		licenceTitle: 'Licence',
		licence: `Code: open source under the ${LICENCE_NAME} licence. Map data © OpenStreetMap contributors, available under the Open Database Licence.`,
		repo: 'Source code',
		donate: 'Bus and train times come from Transitous, run by volunteers. Support them with a donation.',
		contactTitle: 'Contact',
		contact: 'Wrong hours or kosher info? Use "Report a problem" on the place. It reaches us directly.',
	},
	he: {
		title: 'אודות Fair Enough',
		what: 'Fair Enough מוצא מקומות בישראל ששניים או שלושה אנשים מגיעים אליהם בערך באותו זמן, שפתוחים לאורך כל המפגש, ושיש מהם דרך חזרה למי שנוסע בתחבורה ציבורית. השירות חינמי וקוד פתוח.',
		sources: 'מאיפה המידע מגיע',
		privacyTitle: 'פרטיות',
		privacy: [
			'כתובות היציאה נשארות במכשיר שלכם. הן אף פעם לא מופיעות בקישורים או בכתובת העמוד.',
			'המיקום שלכם משמש פעם אחת למילוי שדה ולא נשמר.',
			'כדי למנוע ניצול לרעה אנחנו סופרים בקשות לפי חיבור, בעזרת קוד חד־כיווני שמתחלף כל יום. כתובות IP לא נשמרות.',
			'תכנונים משותפים פגים אחרי זמן מה. אי אפשר לדפדף בהם או לראות רשימה שלהם.',
		],
		licenceTitle: 'רישיון',
		licence: `הקוד: קוד פתוח ברישיון ${LICENCE_NAME}. נתוני המפה © תורמי OpenStreetMap, ברישיון Open Database License.`,
		repo: 'קוד המקור',
		donate: 'זמני האוטובוסים והרכבות מגיעים מ־Transitous, שמופעל על ידי מתנדבים. אפשר לתמוך בהם בתרומה.',
		contactTitle: 'יצירת קשר',
		contact: 'שעות או כשרות לא נכונות? לחצו על "דיווח על בעיה" ליד המקום. הדיווח מגיע אלינו ישירות.',
	},
};

function About() {
	const { lang } = usePrefs();
	const c = COPY[lang];
	const h2 = 'text-lg font-semibold';
	return (
		<PageShell>
			<article className="flex flex-col gap-8">
				<header className="flex flex-col gap-3">
					<h1 className="text-2xl font-semibold text-balance">{c.title}</h1>
					<p className="text-pretty">{c.what}</p>
				</header>
				<section className="flex flex-col gap-3">
					<h2 className={h2}>{c.sources}</h2>
					<ul className="flex flex-col divide-y divide-border border-y border-border">
						{SOURCES.map((s) => (
							<li key={s.name} className="flex flex-col gap-0.5 py-3">
								<a href={s.href} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2" dir="ltr">
									{s.name}
								</a>
								<span className="text-sm text-muted-foreground">{lang === 'he' ? s.he : s.en}</span>
							</li>
						))}
					</ul>
				</section>
				<section className="flex flex-col gap-3">
					<h2 className={h2}>{c.privacyTitle}</h2>
					<ul className="flex list-disc flex-col gap-2 ps-5 text-pretty">
						{c.privacy.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				</section>
				<section className="flex flex-col gap-2">
					<h2 className={h2}>{c.licenceTitle}</h2>
					<p className="text-pretty">{c.licence}</p>
					<p>
						<a href={REPO_URL} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
							Open source · MIT
						</a>{' '}
						<span dir="ltr" className="text-sm text-muted-foreground">
							({REPO_URL.replace('https://', '')})
						</span>
					</p>
				</section>
				<section className="flex flex-col gap-2">
					<h2 className={h2}>Transitous</h2>
					<p className="text-pretty">
						{c.donate}{' '}
						<a href={TRANSITOUS_DONATE} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2" dir="ltr">
							transitous.org/donate
						</a>
					</p>
				</section>
				<section className="flex flex-col gap-2">
					<h2 className={h2}>{c.contactTitle}</h2>
					<p className="text-pretty">{c.contact}</p>
				</section>
			</article>
		</PageShell>
	);
}
