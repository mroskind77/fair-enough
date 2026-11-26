import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { OCCASION_DEFAULTS, type Occasion } from '@/lib/chips';
import { useT } from '@/lib/i18n';
import { isPast, israelNow, nextHalfHour } from '@/lib/time';

export type Mode = 'car' | 'transit' | 'walk';
export const MODES: Mode[] = ['car', 'transit', 'walk'];

export interface Place {
	label: string;
	sublabel?: string;
	lat: number;
	lon: number;
	provider: string;
}

export interface Person {
	id: string;
	mode: Mode;
	text: string;
	place: Place | null;
}

export interface Plan {
	people: Person[];
	meetAt: string | null;
	durationMin: number;
	occasion: Occasion;
	chips: string[];
	kosher: boolean;
}

const STORAGE_KEY = 'fe_plan_v1';
/** Names are saved on this device (localStorage) so they survive new searches; never sent anywhere. */
const NAMES_KEY = 'fe_names_v1';

/** A new, empty form starts both riders on bus/train (RULES.md 21). Saved plans keep their own modes. */
export const DEFAULT_MODE: Mode = 'transit';

export const initialPlan = (): Plan => ({
	people: [
		{ id: 'p1', mode: DEFAULT_MODE, text: '', place: null },
		{ id: 'p2', mode: DEFAULT_MODE, text: '', place: null },
	],
	meetAt: null,
	durationMin: 60,
	occasion: 'friends',
	chips: [...OCCASION_DEFAULTS.friends],
	kosher: false,
});

/** The plan the form opens with: the saved one as it is (modes untouched), otherwise a new empty form. */
export function startPlan(saved: string | null): Plan {
	try {
		const restored = saved ? (JSON.parse(saved) as Plan) : null;
		if (restored && Array.isArray(restored.people)) return restored;
	} catch {
		// Unreadable: start a new form.
	}
	return initialPlan();
}

interface PlanContextValue {
	plan: Plan;
	ready: boolean;
	update: (fn: (p: Plan) => Plan) => void;
	updatePerson: (id: string, patch: Partial<Person>) => void;
	/** Names typed on this device, by person slot (p1, p2, p3). Empty means the default label. */
	names: Record<string, string>;
	setName: (id: string, name: string) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

/**
 * Plan state lives on this device only (sessionStorage), never in the URL:
 * starting addresses must not end up in links or logs.
 */
export function PlanProvider({ children }: { children: ReactNode }) {
	const [plan, setPlan] = useState<Plan>(initialPlan);
	const [ready, setReady] = useState(false);
	const [names, setNames] = useState<Record<string, string>>({});
	const loaded = useRef(false);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(NAMES_KEY);
			if (raw) setNames(JSON.parse(raw) as Record<string, string>);
		} catch {
			// Blocked storage: default labels.
		}
	}, []);

	useEffect(() => {
		let raw: string | null = null;
		try {
			raw = sessionStorage.getItem(STORAGE_KEY);
		} catch {
			raw = null;
		}
		const base = startPlan(raw);
		if (!base.meetAt || isPast(base.meetAt, israelNow())) base.meetAt = nextHalfHour();
		setPlan(base);
		loaded.current = true;
		setReady(true);
	}, []);

	useEffect(() => {
		if (!loaded.current) return;
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
		} catch {
			// Storage full or blocked: the plan still works for this visit.
		}
	}, [plan]);

	const value = useMemo<PlanContextValue>(
		() => ({
			plan,
			ready,
			update: (fn) => setPlan((p) => fn(p)),
			updatePerson: (id, patch) =>
				setPlan((p) => ({ ...p, people: p.people.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
			names,
			setName: (id, name) =>
				setNames((cur) => {
					const next = { ...cur, [id]: name.trim().slice(0, 24) };
					if (!next[id]) delete next[id];
					try {
						localStorage.setItem(NAMES_KEY, JSON.stringify(next));
					} catch {
						// Storage blocked: the name lasts for this visit.
					}
					return next;
				}),
		}),
		[plan, ready, names],
	);

	return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
	const ctx = useContext(PlanContext);
	if (!ctx) throw new Error('usePlan must be used inside PlanProvider');
	return ctx;
}

export const PERSON_COLORS = ['var(--fe-p1)', 'var(--fe-p2)', 'var(--fe-p3)'];
/** Colour is never the only cue: person 1 circle, person 2 square, person 3 diamond. */
export const PERSON_SHAPES = ['circle', 'square', 'diamond'] as const;
export type PersonShape = (typeof PERSON_SHAPES)[number];

/** Display name for person slot `index` (0-based): a typed name, else You / Them / Someone else. */
export function usePersonName() {
	const { names, plan } = usePlan();
	const { t } = useT();
	const people = plan.people;
	return useCallback(
		(index: number) => {
			const id = people[index]?.id ?? `p${index + 1}`;
			return names[id] || t(`person_${(Math.min(index, 2) + 1) as 1 | 2 | 3}`);
		},
		[names, people, t],
	);
}
