export type ChipGroup = 'eat' | 'do';
export type Occasion = 'date' | 'friends' | 'family';

export interface Chip {
	id: string;
	group: ChipGroup;
	en: string;
	he: string;
	/** Thin data: shows the "few listed" mark (spec 3.6). */
	few?: boolean;
	food?: boolean;
}

export const CHIPS: Chip[] = [
	{ id: 'cafe', group: 'eat', en: 'Cafe', he: 'בית קפה', food: true },
	{ id: 'restaurant', group: 'eat', en: 'Sit-down restaurant', he: 'מסעדה עם ישיבה', food: true },
	{ id: 'fast_food', group: 'eat', en: 'Fast food', he: 'מזון מהיר', food: true },
	{ id: 'falafel', group: 'eat', en: 'Falafel or shawarma', he: 'פלאפל או שווארמה', food: true },
	{ id: 'pizza', group: 'eat', en: 'Pizza', he: 'פיצה', food: true },
	{ id: 'burger', group: 'eat', en: 'Burger', he: 'המבורגר', food: true },
	{ id: 'asian', group: 'eat', en: 'Sushi or Asian', he: 'סושי או אסייתי', food: true },
	{ id: 'italian', group: 'eat', en: 'Italian', he: 'איטלקי', food: true },
	{ id: 'ice_cream', group: 'eat', en: 'Ice cream', he: 'גלידה', food: true },
	{ id: 'bakery', group: 'eat', en: 'Bakery', he: 'מאפייה', food: true },
	{ id: 'bar', group: 'eat', en: 'Bar or pub', he: 'בר או פאב', food: true },
	{ id: 'park', group: 'do', en: 'Park', he: 'פארק' },
	{ id: 'picnic', group: 'do', en: 'Picnic or BBQ', he: 'פיקניק או מנגל' },
	{ id: 'beach', group: 'do', en: 'Beach', he: 'חוף' },
	{ id: 'viewpoint', group: 'do', en: 'Viewpoint', he: 'תצפית' },
	{ id: 'museum', group: 'do', en: 'Museum', he: 'מוזיאון' },
	{ id: 'gallery', group: 'do', en: 'Gallery', he: 'גלריה' },
	{ id: 'cinema', group: 'do', en: 'Cinema', he: 'קולנוע' },
	{ id: 'theatre', group: 'do', en: 'Theatre', he: 'תיאטרון' },
	{ id: 'mall', group: 'do', en: 'Mall', he: 'קניון' },
	{ id: 'zoo', group: 'do', en: 'Zoo or aquarium', he: 'גן חיות או אקווריום' },
	{ id: 'climbing', group: 'do', en: 'Climbing gym', he: 'קיר טיפוס' },
	{ id: 'bowling', group: 'do', en: 'Bowling', he: 'באולינג', few: true },
	{ id: 'escape', group: 'do', en: 'Escape room', he: 'חדר בריחה', few: true },
	{ id: 'pottery', group: 'do', en: 'Pottery', he: 'קרמיקה', few: true },
	{ id: 'trampoline', group: 'do', en: 'Trampoline park', he: 'פארק טרמפולינות', few: true },
	{ id: 'karaoke', group: 'do', en: 'Karaoke', he: 'קריוקי', few: true },
	{ id: 'lasertag', group: 'do', en: 'Laser tag or paintball', he: 'לייזר טאג או פיינטבול', few: true },
	{ id: 'karting', group: 'do', en: 'Karting', he: 'קארטינג', few: true },
	{ id: 'amusement', group: 'do', en: 'Theme or water park', he: 'לונה פארק או פארק מים' },
	{ id: 'workshop', group: 'do', en: 'Workshop', he: 'סדנה', few: true },
];

export const CHIP_BY_ID = Object.fromEntries(CHIPS.map((c) => [c.id, c])) as Record<string, Chip>;

/** Occasion only pre-selects chips (and later adjusts ranking). It never hides any. */
export const OCCASION_DEFAULTS: Record<Occasion, string[]> = {
	date: ['cafe', 'restaurant', 'ice_cream', 'viewpoint'],
	friends: ['cafe', 'pizza', 'burger', 'falafel', 'bowling', 'escape'],
	family: ['restaurant', 'park', 'picnic', 'museum', 'ice_cream'],
};

export const DURATIONS = [30, 60, 120, 180] as const;
