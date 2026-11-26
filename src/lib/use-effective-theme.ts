import { useEffect, useState } from 'react';

import { usePrefs } from '@/lib/i18n';

/** Resolves "system" to light/dark. Starts as light on the server; updates after mount. */
export function useEffectiveTheme(): 'light' | 'dark' {
	const { theme } = usePrefs();
	const [systemDark, setSystemDark] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const update = () => setSystemDark(mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	}, []);

	if (theme === 'system') return systemDark ? 'dark' : 'light';
	return theme;
}
