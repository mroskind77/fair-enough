import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import type { Lang } from '@/lib/prefs';

export interface Suggestion {
	id: string;
	label: string;
	sublabel?: string;
	lat: number;
	lon: number;
}

export type GeoErrorKind = 'busy' | 'failed';

export class GeoError extends Error {
	constructor(public kind: GeoErrorKind) {
		super(kind);
	}
}

/** Attribution each provider requires next to its results (spec 5.3). */
export const PROVIDER_ATTRIBUTION: Record<string, { text: string; href: string }> = {
	photon: { text: 'Photon · © OpenStreetMap contributors', href: 'https://photon.komoot.io' },
	geoapify: { text: 'Powered by Geoapify', href: 'https://www.geoapify.com' },
	locationiq: { text: 'Search by LocationIQ.com', href: 'https://locationiq.com' },
	heigit: { text: 'HeiGIT · © OpenStreetMap contributors', href: 'https://heigit.org' },
};

async function callGeo<T>(body: Record<string, unknown>): Promise<T> {
	if (!supabase) throw new GeoError('failed');
	// Inputs travel in the POST body only: coordinates and text never go in URLs.
	const { data, error } = await supabase.functions.invoke('geo', { body });
	if (error) {
		const status = error instanceof FunctionsHttpError ? (error.context as Response).status : 0;
		throw new GeoError(status === 429 ? 'busy' : 'failed');
	}
	return data as T;
}

/**
 * Same display name in the same city/area is one suggestion (e.g. a city listed once per postcode); keeps the first.
 * Postcodes and other number-only parts don't count as part of the area.
 */
function dropDuplicates(list: Suggestion[]): Suggestion[] {
	const norm = (t: string) => t.toLowerCase().replace(/[\s'"׳״`’\-–]+/g, ' ').trim();
	const area = (sub?: string) =>
		(sub ?? '')
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p && !/^[\d\s-]+$/.test(p))
			.map(norm)
			.join('|');
	const seen = new Set<string>();
	return list.filter((s) => {
		const k = `${norm(s.label)}#${area(s.sublabel)}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

export async function suggest(q: string, lang: Lang) {
	const r = await callGeo<{ provider: string; results: Suggestion[] }>({ action: 'suggest', q, lang });
	return { ...r, results: dropDuplicates(r.results ?? []) };
}

export function reverse(lat: number, lon: number, lang: Lang) {
	return callGeo<{ area: string | null }>({ action: 'reverse', lat, lon, lang });
}
