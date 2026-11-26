/**
 * Formats an OSM opening_hours value as a per-language weekly list ("Sun to Fri 08:00 to 02:00").
 * Handles the common forms (day ranges, day lists, several time spans, "off", 24/7). Anything else returns
 * null, and the raw string is never shown.
 */
const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

type Lang = 'he' | 'en';

function dayName(i: number, lang: Lang) {
	return (lang === 'he' ? HE : EN)[i];
}

function parseDays(spec: string): number[] | null {
	const out: number[] = [];
	for (const part of spec.split(',')) {
		const m = part.trim().match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?$/);
		if (!m) return null;
		const a = OSM_DAYS.indexOf(m[1]);
		const b = m[2] ? OSM_DAYS.indexOf(m[2]) : a;
		if (a < 0 || b < 0) return null;
		for (let i = a; ; i = (i + 1) % 7) {
			out.push(i);
			if (i === b) break;
		}
	}
	return out;
}

export function formatWeeklyHours(raw: string | undefined, lang: Lang): string[] | null {
	if (!raw) return null;
	const text = raw.trim();
	const to = lang === 'he' ? ' עד ' : ' to ';
	if (text === '24/7') return [lang === 'he' ? 'פתוח 24 שעות' : 'Open 24 hours'];
	const week: (string | null)[] = Array(7).fill(null);
	for (const rule of text.split(';')) {
		const r = rule.trim();
		if (!r) continue;
		const m = r.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)?\s*(.*)$/);
		if (!m) return null;
		const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
		if (!days) return null;
		const times = m[2].trim();
		let value: string;
		if (/^(off|closed)$/i.test(times)) value = lang === 'he' ? 'סגור' : 'Closed';
		else {
			const spans = times.split(',').map((s) => s.trim());
			if (!spans.every((s) => /^\d{1,2}:\d\d-\d{1,2}:\d\d\+?$/.test(s))) return null;
			value = spans
				.map((s) => {
					const [a, b] = s.replace('+', '').split('-');
					return `${a.padStart(5, '0')}${to}${b.padStart(5, '0').replace('24:00', '00:00')}`;
				})
				.join(', ');
		}
		for (const d of days) week[d] = value;
	}
	// Group consecutive days (Sun first) with the same hours.
	const lines: string[] = [];
	let i = 0;
	while (i < 7) {
		const v = week[i];
		let j = i;
		while (j + 1 < 7 && week[j + 1] === v) j++;
		if (v !== null) lines.push(`${dayName(i, lang)}${j > i ? `${to}${dayName(j, lang)}` : ''} ${v}`);
		i = j + 1;
	}
	return lines.length ? lines : null;
}
