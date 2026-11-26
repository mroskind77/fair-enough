export type Lang = 'he' | 'en';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Prefs {
	lang: Lang;
	theme: ThemePref;
}

export const LANG_COOKIE = 'fe_lang';
export const THEME_COOKIE = 'fe_theme';

export function resolvePrefs(lang: string | undefined, theme: string | undefined, acceptLanguage: string | undefined): Prefs {
	const resolvedLang: Lang =
		lang === 'he' || lang === 'en' ? lang : /^(he|iw)\b/i.test(acceptLanguage ?? '') ? 'he' : 'en';
	const resolvedTheme: ThemePref = theme === 'light' || theme === 'dark' ? theme : 'system';
	return { lang: resolvedLang, theme: resolvedTheme };
}

function readCookie(name: string): string | undefined {
	const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
	return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

/** Browser-side read. Falls back to what the server rendered on <html>. */
export function readClientPrefs(): Prefs {
	const html = document.documentElement;
	return resolvePrefs(
		readCookie(LANG_COOKIE) ?? html.lang,
		readCookie(THEME_COOKIE) ?? html.dataset.theme,
		undefined,
	);
}

export function writePrefCookie(name: string, value: string) {
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}
