// All meeting times are Israel local time strings: "YYYY-MM-DDTHH:mm".
const TZ = 'Asia/Jerusalem';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

function parts(d: Date) {
	const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
	return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsraelLocal(d: Date): string {
	const p = parts(d);
	return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

function offsetMinutes(d: Date): number {
	const p = parts(d);
	return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

export function israelLocalToDate(local: string): Date {
	const [date, time] = local.split('T');
	const [y, m, d] = date.split('-').map(Number);
	const [h, mi] = time.split(':').map(Number);
	const guess = Date.UTC(y, m - 1, d, h, mi);
	const first = offsetMinutes(new Date(guess));
	const second = offsetMinutes(new Date(guess - first * 60000));
	return new Date(guess - second * 60000);
}

/** Call only in effects/handlers (reads the clock). */
export function nextHalfHour(): string {
	const step = 30 * 60000;
	return toIsraelLocal(new Date(Math.floor(Date.now() / step) * step + step));
}

/** Call only in effects/handlers (reads the clock). */
export function israelNow(): string {
	return toIsraelLocal(new Date());
}

export function isPast(local: string, now: string): boolean {
	return local < now;
}

export function addMinutes(local: string, minutes: number): string {
	return toIsraelLocal(new Date(israelLocalToDate(local).getTime() + minutes * 60000));
}

/** 24-hour "HH:MM" everywhere, in both languages. */
export function closingTime(local: string): string {
	return local.slice(11, 16);
}

export function timeOf(local: string): string {
	return local.slice(11, 16);
}

export function formatDay(local: string, lang: 'he' | 'en'): string {
	return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-IL', {
		timeZone: TZ,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(israelLocalToDate(local));
}

const HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 25 Nov, 23:30" / "יום ד׳, 25.11, 23:30". The local string is already Israel wall time. */
export function formatWhen(local: string, lang: 'he' | 'en'): string {
	const [y, m, d] = local.slice(0, 10).split('-').map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	const hm = local.slice(11, 16);
	if (lang === 'he') return `${dow === 6 ? 'שבת' : `יום ${HE_DAYS[dow]}`}, ${d}.${m}, ${hm}`;
	return `${EN_DAYS[dow]} ${d} ${EN_MONTHS[m - 1]}, ${hm}`;
}

/** Day only: "Wed 25 Nov" / "יום ד׳, 25.11". */
export function formatDayShort(local: string, lang: 'he' | 'en'): string {
	return formatWhen(local, lang).replace(/, \d\d:\d\d$/, '');
}
