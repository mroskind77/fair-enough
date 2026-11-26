// Renders the real results page with mocked search/trip responses (no network) and checks the on-screen order.
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { FillIn, SearchResult, Venue } from "@/lib/search-client";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (o: object) => ({ options: o }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => () => undefined,
  useRouteContext: () => ({ prefs: { lang: "en", theme: "light" } }),
  useRouter: () => ({ invalidate: () => undefined }),
}));
vi.mock("@/components/MapView", () => ({ MapView: () => null }));
vi.mock("@/components/PageShell", () => ({ PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/config/app-head", () => ({ pageHead: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: null }));
vi.mock("@/lib/i18n", async (orig) => {
  const real = await orig<typeof import("@/lib/i18n")>();
  return { ...real, useT: () => ({ lang: "en", t: (k: never, v?: never) => real.translate("en", k, v) }) };
});
const PLAN = {
  people: [
    { id: "a", mode: "transit", text: "Modi'in", place: { label: "Modi'in-Maccabim-Re'ut", lat: 31.8969, lon: 35.0095, provider: "x" } },
    { id: "b", mode: "transit", text: "Arlosoroff 100", place: { label: "Arlosoroff 100", lat: 32.0866, lon: 34.7826, provider: "x" } },
  ],
  meetAt: "2026-11-26T17:00",
  durationMin: 90,
  occasion: "coffee",
  chips: ["cafe"],
  kosher: false,
};
vi.mock("@/lib/plan-store", async (orig) => ({
  ...(await orig<object>()),
  usePlan: () => ({ plan: PLAN, ready: true, update: () => undefined }),
  usePersonName: () => (i: number) => `P${i + 1}`,
}));
const api = vi.hoisted(() => ({ runSearch: vi.fn(), fillIn: vi.fn(), loadMore: vi.fn() }));
vi.mock("@/lib/search-client", async (orig) => ({ ...(await orig<object>()), ...api }));

import { Route } from "@/routes/results";

const venue = (id: string, a: number, b: number, estimate: boolean): Venue =>
  ({
    id,
    name: id,
    ln: { base: id, en: id, he: id },
    chip: "cafe",
    lat: 32,
    lon: 34.9,
    source: "osm",
    per: [a, b].map((m) => ({ minutes: m, leaveBy: "2026-11-26T16:00", mode: "transit", estimate })),
    max: Math.max(a, b),
    gap: Math.abs(a - b),
    dist: 20,
    score: 0,
    hours: "open",
    kosher: null,
    fit: true,
  }) as Venue;

// Estimates (first answer) and real trips (what the timetable says). Real gaps: Z 20, Y 14, X 18, W 25, V 28, U 30.
const EST: Record<string, Venue> = {
  Z: venue("Z", 30, 31, true),
  Y: venue("Y", 30, 33, true),
  X: venue("X", 30, 35, true),
  W: venue("W", 30, 38, true),
  V: venue("V", 30, 40, true),
  U: venue("U", 30, 41, true),
};
const REAL: Record<string, Venue> = {
  Z: venue("Z", 20, 40, false),
  Y: venue("Y", 26, 40, false),
  X: venue("X", 22, 40, false),
  W: venue("W", 20, 45, false),
  V: venue("V", 20, 48, false),
  U: venue("U", 20, 50, false),
};
const GAP: Record<string, number> = Object.fromEntries(Object.entries(REAL).map(([k, v]) => [k, v.gap]));

const meta = {
  radiusKm: 4,
  radiusScale: 1,
  cap: 60,
  blocker: null,
  counts: { found: 40, kosherDropped: 0, tooFar: 0, unreachable: 0 },
  sources: { places: "osm" },
  transitLive: true,
};
const hidden = { noRideHome: 0, noService: 0, noRideWho: -1 };
const answer = (venues: Venue[], extra: Partial<FillIn> = {}): FillIn =>
  ({ poolId: "pool", total: 30, offset: 5, more: true, pending: false, hidden, venues, dropped: [], blocker: null, ...extra }) as FillIn;

const later = <T,>(ms: number, v: T) => new Promise<T>((res) => setTimeout(() => res(v), ms));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  Element.prototype.animate = (() => ({})) as never;
  Element.prototype.scrollIntoView = () => undefined;

  api.runSearch.mockResolvedValue({
    ...meta,
    poolId: "pool",
    total: 30,
    offset: 5,
    more: true,
    pending: true,
    hidden,
    venues: ["Z", "Y", "X", "W", "V"].map((k) => EST[k]),
  } satisfies Partial<SearchResult>);

  // X: instant (from cache). Y: timed out the first time, real on the retry. Z: only comes back after 20 s (late).
  // W, V and a 6th place U (if asked for) answer at once.
  let zAsked = 0;
  api.fillIn.mockImplementation((_pool: string, _off: number, _people: unknown, ids: string[], phase: string, _l: string, _r?: boolean, _k?: boolean, extra?: number) => {
    if (phase !== "out") throw new Error(`ride home asked on load: ${phase}`);
    const now: Venue[] = [];
    const add: Venue[] = [];
    for (const id of ids) if (id === "X" || id === "W" || id === "V" || id === "U") now.push(REAL[id]);
    if (extra) add.push(REAL.U);
    const yRetry = ids.includes("Y") && api.fillIn.mock.calls.filter((c) => (c[3] as string[]).includes("Y")).length > 1;
    if (yRetry) now.push(REAL.Y);
    if (ids.includes("Z") && ++zAsked === 2) return later(20000, answer([REAL.Z]));
    return later(100, answer([...now, ...add], add.length ? { offset: 6 } : {}));
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const rowOrder = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("li[id^='row-']")].map((li) => li.id.slice(4));

test("results page: top 3 on screen are smallest real gap first, even with cache / retry / late answers", async () => {
  const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const Page = (Route as unknown as { options: { component: () => ReactNode } }).options.component;
  const { container } = render(<Page />);
  // Step through 40 s of time so effects that start mid-way still see their timers fire.
  for (let i = 0; i < 400; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  const order = rowOrder(container);
  const top3 = order.slice(0, 3);
  const gaps = top3.map((id) => GAP[id]);
  expect(api.runSearch).toHaveBeenCalledTimes(1);
  // Hidden pass: the first lookup asks for the 5 rows on screen plus 1 more place (top 6 by estimate).
  expect(api.fillIn.mock.calls[0][3]).toEqual(["Z", "Y", "X", "W", "V"]);
  expect(api.fillIn.mock.calls[0][8]).toBe(1);
  expect(order).toHaveLength(6);
  // Exactly one [search] line, with both places, modes and radius step.
  const lines = logs.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[search]"));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/A: Modi'in-Maccabim-Re'ut \(transit\) \| B: Arlosoroff 100 \(transit\) \| radius step 1\/3/);
  expect(gaps, `on-screen order ${order.join(",")}`).toEqual([...gaps].sort((a, b) => a - b));
  // All of the top 3 show real times by now.
  for (const id of top3) expect(container.querySelector(`#row-${id}`)?.textContent ?? "").not.toMatch(/~/);
});
