import { Link } from '@tanstack/react-router';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Wordmark } from '@/components/Logo';
import { usePrefs, useT } from '@/lib/i18n';
import type { ThemePref } from '@/lib/prefs';

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };

export function SiteHeader() {
	const { t, lang } = useT();
	const { theme, setLang, setTheme } = usePrefs();
	const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
	const modeName = theme === 'light' ? t('themeLight') : theme === 'dark' ? t('themeDark') : t('themeSystem');

	return (
		<header className="border-b border-border">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:bg-surface focus:p-2"
			>
				{t('skip')}
			</a>
			<div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
				<Link to="/" className="flex items-center text-foreground" aria-label="Fair Enough">
					<Wordmark className="h-9 w-auto" />
				</Link>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
						aria-label={t('switchLangLabel')}
						lang={lang === 'he' ? 'en' : 'he'}
						className="min-h-11 rounded-sm px-3 text-body font-medium hover:bg-surface-2"
					>
						{t('switchLang')}
					</button>
					<button
						type="button"
						onClick={() => setTheme(NEXT_THEME[theme])}
						aria-label={t('themeLabel', { mode: modeName })}
						title={t('themeLabel', { mode: modeName })}
						className="grid size-11 place-items-center rounded-sm bg-surface-2"
					>
						<ThemeIcon className="size-5" aria-hidden="true" />
					</button>
				</div>
			</div>
		</header>
	);
}
