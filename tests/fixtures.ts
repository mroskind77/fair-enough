// Fixed fixture data for the tests. No network.
import type { FillIn, PerPerson, Venue } from "../src/lib/search-client";

const per = (minutes: number, estimate = false): PerPerson =>
  ({ minutes, leaveBy: "2026-11-26T15:30", mode: "transit", estimate }) as PerPerson;

/** A row whose riders take `mins` minutes each; gap/max derived the same way the server does. */
export function venue(id: string, mins: number[], o: { estimate?: boolean; dist?: number; dropped?: boolean } = {}): Venue {
  const max = Math.max(...mins);
  return {
    id,
    name: id,
    ln: { base: id, he: `${id} (he)`, en: id },
    chip: "cafe",
    lat: 31.9,
    lon: 34.9,
    source: "osm",
    per: mins.map((m) => per(m, o.estimate)),
    max,
    gap: max - Math.min(...mins),
    dist: o.dist ?? 10,
    score: 0,
    hours: "open",
    kosher: null,
    fit: true,
    ...(o.dropped ? { dropped: "no_service" as Venue["dropped"] } : {}),
  } as Venue;
}
export const real = (v: Venue): Venue => ({ ...v, per: v.per.map((p) => ({ ...p, estimate: false })) });

/** The QA case: all real, gaps 16 / 3 / 5. */
export const aroma = venue("Aroma", [20, 36]); // gap 16
export const mcd = venue("McDonald's", [30, 33]); // gap 3
export const avi = venue("Avi Kabab", [28, 33]); // gap 5

export const fill = (venues: Venue[], extra: Partial<FillIn> = {}): FillIn =>
  ({ venues, dropped: [], total: 30, offset: 5, more: true, hidden: 0, blocker: null, ...extra }) as unknown as FillIn;

export const plan = {
  people: [
    { id: "a", mode: "transit", text: "Modi'in-Maccabim-Re'ut", place: { label: "Modi'in-Maccabim-Re'ut", lat: 31.8969, lon: 35.0095, provider: "x" } },
    { id: "b", mode: "transit", text: "Arlosoroff 100", place: { label: "Arlosoroff 100, Tel Aviv-Yafo", lat: 32.0866, lon: 34.7826, provider: "x" } },
  ],
  meetAt: "2026-11-26T16:00",
  durationMin: 90,
  occasion: "coffee",
  chips: ["cafe"],
  kosher: false,
} as never;
