import { Link } from '@tanstack/react-router';

import { useT } from '@/lib/i18n';

const linkCls = 'underline underline-offset-2';

export function SiteFooter() {
	const { t } = useT();

	return (
		<footer className="mt-16 border-t border-border">
			<div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-micro font-medium text-muted-foreground">
				<p className="text-pretty">
					{t('footerMapData')}{' '}
					<a className={linkCls} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
						{t('footerOsm')}
					</a>
					{' · '}
					{t('footerTiles')}{' '}
					<a className={linkCls} href="https://openfreemap.org" target="_blank" rel="noreferrer">
						OpenFreeMap
					</a>
					{' · '}
					{t('footerShabbat')}{' '}
					<a className={linkCls} href="https://www.hebcal.com" target="_blank" rel="noreferrer">
						Hebcal (CC BY 4.0)
					</a>
					{' · '}
					{t('footerTransit')}{' '}
					<a className={linkCls} href="https://transitous.org/sources/" target="_blank" rel="noreferrer">
						{t('footerTransitSources')}
					</a>
				</p>
				<p>
					<Link to="/about" className={`${linkCls} text-foreground`}>
						{t('about')}
					</Link>
				</p>
			</div>
		</footer>
	);
}
