import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';

import { LANG_COOKIE, resolvePrefs, THEME_COOKIE } from '@/lib/prefs';

/** Reads the visitor's saved language/theme (or Accept-Language) for the first server render. */
export const getServerPrefs = createServerFn({ method: 'GET' }).handler(() =>
	resolvePrefs(getCookie(LANG_COOKIE), getCookie(THEME_COOKIE), getRequestHeader('accept-language')),
);
