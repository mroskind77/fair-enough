import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, Loader2, WifiOff } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MapView, type MapPin } from "@/components/MapView";
import { PageShell } from "@/components/PageShell";
import { ResultRow } from "@/components/results/ResultRow";
import { pageHead } from "@/config/app-head";
import { translate, useT } from "@/lib/i18n";
import { usePersonName, usePlan } from "@/lib/plan-store";
import {
  type Venue,
  buildRequest,
  fairSort,
  fillIn,
  finalSort,
  fairCmp,
  venueNames,
  loadMore,
  type FillIn,
  type FillPhase,
  type FillStage,
  runSearch,
  SearchError,
  WIDER,
  type SearchErrorKind,
  type SearchOptions,
  type SearchResult,
} from "@/lib/search-client";
import { addMinutes, formatDayShort, timeOf } from "@/lib/time";
import {
  fairerBelowId,
  HIDDEN_PASS,
  keepTop3Fair,
  onPlanChange,
  pickBest3,
  searchFingerprint,
  searchLogLine,
  settleTop3,
} from "@/lib/ranking";

export const Route = createFileRoute("/results")({
  head: ({ match }) => ({
    ...pageHead({
      title: `${translate(match.context.prefs.lang, "results")} · Fair Enough`,
      description: translate(match.context.prefs.lang, "heroSub"),
      path: "/results",
      noindex: true,
    }),
  }),
  component: Results,
});

const STORE_KEY = "fe_results_v4";

/** Warning banner: first sentence in the warning colour, the rest in ink. */
function Banner({ text, children }: { text: string; children?: ReactNode }) {
  const m = text.match(/^(.+?[.?!])\s+([\s\S]*)$/);
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-warn-bg px-4 py-3" role="note">
      <p className="flex items-start gap-2 text-small text-pretty">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
        <span>
          <span className="font-medium text-warn">{m ? m[1] : text}</span>
          {m && <span className="text-foreground"> {m[2]}</span>}
        </span>
      </p>
      {children}
    </div>
  );
}
const DEFAULT_OPTS: SearchOptions = { radiusScale: 1, capBonus: 0 };

interface Stored {
  fp: string;
  opts: SearchOptions;
  result: SearchResult;
}

const roughTransitP = (p: SearchResult["venues"][number]["per"][number]) =>
  p.mode === "transit" && Boolean(p.estimate);

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(s: Stored) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: results still show for this visit.
  }
}

function Results() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { plan, ready, update } = usePlan();
  const nameOf = usePersonName();
  const Back = lang === "he" ? ArrowRight : ArrowLeft;
  const hasPlan =
    ready &&
    Boolean(plan.meetAt) &&
    plan.people.every((p) => p.place) &&
    plan.chips.length > 0;

  const [opts, setOpts] = useState<SearchOptions>(DEFAULT_OPTS);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<SearchErrorKind | null>(null);
  const [stage, setStage] = useState<"places" | "drive">("places");
  const [moreLoading, setMoreLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const inflight = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Result row and map pin that point at the same place highlight each other.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    const row = document.getElementById(`row-${id}`);
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, []);

  // The plan without this device's search options: changes here mean a new search.
  const baseFp = useMemo(
    () =>
      // Language isn't part of it: EN/HE only re-renders the same results (no new search, no re-rank).
      hasPlan ? searchFingerprint(plan) : "",
    [hasPlan, plan],
  );

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const search = useCallback(
    async (o: SearchOptions) => {
      if (!hasPlan) return;
      const key = `${baseFp}|${o.radiusScale}|${o.capBonus}`;
      if (inflight.current === key) return;
      inflight.current = key;
      console.log(searchLogLine(plan, o, new Date()));
      setOpts(o);
      setStatus("loading");
      setError(null);
      setStage("places");
      lazyStarted.current.clear();
      setHomeState(new Map());
      const timer = setTimeout(() => setStage("drive"), 2500);
      try {
        const r = await runSearch(buildRequest(plan, lang, o));
        // The server may widen the area by itself when few places turn up; continue from that width.
        const used: SearchOptions = {
          ...o,
          radiusScale:
            (r.radiusScale as SearchOptions["radiusScale"]) ?? o.radiusScale,
        };
        setOpts(used);
        const first: SearchResult = {
          ...r,
          venues: fairSort(r.venues),
          fill: r.pending ? "out" : "done",
          firstOut: r.pending,
        };
        setResult(first);
        setStatus("ready");
        writeStored({ fp: baseFp, opts: used, result: first });
      } catch (e) {
        setError(e instanceof SearchError ? e.kind : "failed");
        setStatus("error");
      } finally {
        clearTimeout(timer);
        inflight.current = null;
      }
    },
    [hasPlan, baseFp, plan, lang],
  );

  // First visit with this plan: search. Coming back to the same plan: show the stored results.
  useEffect(() => {
    if (!hasPlan) return;
    const stored = readStored();
    const next = onPlanChange(stored?.fp ?? null, baseFp, navigator.onLine);
    if (next === "restore" && stored) {
      setOpts(stored.opts);
      setResult(stored.result);
      setStatus("ready");
      return;
    }
    if (next === "search") void search(DEFAULT_OPTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlan, baseFp]);

  const people = useMemo(
    () => (hasPlan ? buildRequest(plan, lang, DEFAULT_OPTS).people : []),
    [hasPlan, plan, lang],
  );

  // Row positions just before the one re-sort, for a short slide into the new order (FLIP).
  const flipFrom = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const before = flipFrom.current;
    if (!before) return;
    flipFrom.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, top] of before) {
      const el = document.getElementById(`row-${id}`);
      if (!el) continue;
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 180, easing: "ease-out" });
    }
  });

  /**
   * Puts a fill-in answer into the rows on screen: failed places faded, never removed, rows keep their place.
   * Only the first fill-in of a search may swap a row (no trip at all, or a hidden candidate with a smaller real gap),
   * and only its answer (`final`) re-sorts the rows, once. After that rows never move.
   */
  const mergeFill = useCallback(
    (poolId: string, r: FillIn, patch: Partial<SearchResult>) => {
      const fresh = new Map(r.venues.map((v) => [v.id, v]));
      const failed = new Map(r.dropped.map((d) => [d.id, d.why]));
      const swap = new Map((r.replaced ?? []).map((x) => [x.from, x]));
      const better = new Map((r.swapped ?? []).map((x) => [x.from, x.venue]));
      if (r.final) {
        const tops = new Map<string, number>();
        listRef.current?.querySelectorAll<HTMLElement>("li[id^='row-']").forEach((el) => tops.set(el.id.slice(4), el.getBoundingClientRect().top));
        flipFrom.current = tops;
      }
      setResult((cur) => {
        if (!cur || cur.poolId !== poolId) return cur;
        const merged = cur.venues.map((v) => {
          const s = swap.get(v.id);
          const now: Venue = s
            ? s.why
              ? { ...s.venue, dropped: s.why }
              : { ...s.venue }
            : failed.has(v.id)
              ? { ...v, dropped: failed.get(v.id) }
              : fresh.has(v.id)
                ? { ...fresh.get(v.id)! }
                : v;
          const b = better.get(now.id);
          return b ? { ...b } : now;
        });
        // Places this answer added (the hidden pass's extra rows) go after the live rows, before faded ones.
        const have = new Set(merged.map((v) => v.id));
        for (const x of r.replaced ?? []) have.add(x.venue.id);
        const added = r.venues.filter((v) => !have.has(v.id)).map((v) => ({ ...v }));
        if (added.length) {
          const at = merged.findIndex((v) => v.dropped);
          merged.splice(at < 0 ? merged.length : at, 0, ...added);
        }
        // After the re-sort: a late answer for one of rows 1–3 re-sorts only those 3, so they stay fairest first.
        const settled = cur.fill === "done" && !cur.firstOut;
        const changed = [...fresh.keys(), ...swap.keys(), ...better.keys()];
        const kept = settled && !r.final ? keepTop3Fair(merged, changed) : merged;
        if (kept !== merged) {
          const tops = new Map<string, number>();
          listRef.current?.querySelectorAll<HTMLElement>("li[id^='row-']").forEach((el) => tops.set(el.id.slice(4), el.getBoundingClientRect().top));
          flipFrom.current = tops;
        }
        const next: SearchResult = {
          ...cur,
          ...patch,
          offset: r.final && r.order ? (r.offset ?? cur.offset) : Math.max(cur.offset, r.offset ?? cur.offset),
          total: r.total,
          more: r.more,
          hidden: r.hidden,
          blocker: r.blocker ?? cur.blocker,
          transitDown: r.transitDown ?? cur.transitDown,
          // The one re-sort uses the server's order (fairest real times; hidden places never among them).
          venues: r.final
            ? r.order
              ? r.order.map((v) => ({ ...v }))
              : finalSort(merged)
            : kept,
        };
        writeStored({ fp: baseFp, opts, result: next });
        return next;
      });
    },
    [baseFp, opts],
  );

  // Real trips in stages. A new search fetches real trips (arrive-by the meeting time) for the top 3 rows only.
  // The single re-sort waits until ALL top-3 rows have real trips, or failed, or 15 s have passed; then only those
  // 3 are sorted among themselves (smallest gap, then shorter longest trip, then distance). Every other row keeps its
  // estimate (~) until at least half of it is on screen, then fetches its own real trips. Rows never move after that.
  useEffect(() => {
    if (status !== "ready" || !result || !navigator.onLine) return;
    if (result.fill !== "out" || !result.firstOut) return;
    const poolId = result.poolId;
    const offset = result.offset;
    let cancelled = false;
    void (async () => {
      // Hidden pass: real trips for the top 6 by estimate (rows 1–5 plus the next place), same pacing.
      await settleTop3({
        n: HIDDEN_PASS,
        venues: result.venues,
        fetchOut: (ids, phase, first, extra) => fillIn(poolId, offset, people, ids, phase, lang, first, false, extra),
        onAnswer: (r) => mergeFill(poolId, r, {}),
        cancelled: () => cancelled,
      });
      if (cancelled) return;
      const tops = new Map<string, number>();
      listRef.current?.querySelectorAll<HTMLElement>("li[id^='row-']").forEach((el) => tops.set(el.id.slice(4), el.getBoundingClientRect().top));
      flipFrom.current = tops;
      setResult((cur) => {
        if (!cur || cur.poolId !== poolId) return cur;
        const next: SearchResult = {
          ...cur,
          fill: "done",
          pending: false,
          firstOut: false,
          // Best 3 by real gap as rows 1–3; the other 3 of the hidden pass go next.
          venues: pickBest3(cur.venues),
        };
        writeStored({ fp: baseFp, opts, result: next });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, result?.poolId, result?.fill, result?.firstOut]);

  // Rows still on an estimate fetch real trips once at least 50% of the row is visible (once per row).
  const [rowBusy, setRowBusy] = useState<Set<string>>(() => new Set());
  const lazyStarted = useRef<Set<string>>(new Set());
  const roughIds = useMemo(
    () =>
      result && result.fill === "done"
        ? result.venues.filter((v) => !v.dropped && v.per.some(roughTransitP)).map((v) => v.id)
        : [],
    [result],
  );
  const roughKey = roughIds.join(",");
  useEffect(() => {
    if (!result || !roughIds.length || !navigator.onLine) return;
    const poolId = result.poolId;
    const offset = result.offset;
    const started = lazyStarted.current;
    let waiting: string[] = [];
    let flush = 0;
    const setBusy = (ids: string[], on: boolean) =>
      setRowBusy((cur) => {
        const n = new Set(cur);
        for (const id of ids) {
          if (on) n.add(id);
          else n.delete(id);
        }
        return n;
      });
    const send = () => {
      const ids = waiting;
      waiting = [];
      if (!ids.length) return;
      setBusy(ids, true);
      void fillIn(poolId, offset, people, ids, "out", lang)
        .then((r) => mergeFill(poolId, r, {}))
        .catch(() => undefined) // stays an estimate (~); never a warning
        .finally(() => setBusy(ids, false));
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          const id = e.target.id.slice(4);
          if (started.has(id)) continue;
          started.add(id);
          io.unobserve(e.target);
          waiting.push(id);
        }
        window.clearTimeout(flush);
        flush = window.setTimeout(send, 250);
      },
      { threshold: [0.5] },
    );
    for (const id of roughIds) {
      if (started.has(id)) continue;
      const el = document.getElementById(`row-${id}`);
      if (el) io.observe(el);
    }
    return () => {
      io.disconnect();
      window.clearTimeout(flush);
      if (waiting.length) waiting.forEach((id) => started.delete(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roughKey, result?.poolId]);

  // Ride home on tap: only that place, each rider. 'failed' shows "Couldn't check the ride home. Try again".
  const [homeState, setHomeState] = useState<Map<string, "checking" | "failed">>(() => new Map());
  const checkHome = useCallback(
    async (id: string) => {
      if (!result) return;
      const v = result.venues.find((x) => x.id === id);
      if (!v || !v.per.some((p) => p.mode === "transit" && p.ride !== "ok" && p.ride !== "none")) return;
      if (homeState.get(id) === "checking") return;
      const poolId = result.poolId;
      const set = (st: "checking" | "failed" | null) =>
        setHomeState((cur) => {
          const n = new Map(cur);
          if (st) n.set(id, st);
          else n.delete(id);
          return n;
        });
      set("checking");
      try {
        const r = await fillIn(poolId, result.offset, people, [id], "tap", lang);
        mergeFill(poolId, r, {});
        const after = r.venues.find((x) => x.id === id);
        const open = !after || after.per.some((p) => p.mode === "transit" && p.ride !== "ok" && p.ride !== "none");
        set(open && !r.dropped.some((d) => d.id === id) ? "failed" : null);
      } catch {
        set("failed");
      }
    },
    [result, people, mergeFill, lang, homeState],
  );
  const onRowTap = useCallback(
    (id: string) => {
      setSelectedId(id);
      void checkHome(id);
    },
    [checkHome],
  );

  const onMore = async () => {
    if (!result) return;
    setMoreLoading(true);
    const firstNew = result.venues.length;
    const start = result.offset;
    try {
      const page = await loadMore(result.poolId, start, people, lang);
      const next: SearchResult = {
        ...result,
        ...page,
        // New rows fetch real trips only once they're on screen (never replacing rows: that's the first search only).
        fill: "done",
        pending: false,
        firstOut: false,
        // Rows already on screen never move: the new batch goes below them, in fair order.
        venues: [...result.venues, ...fairSort(page.venues)],
        batchStart: result.venues.length,
      };
      setResult(next);
      writeStored({ fp: baseFp, opts, result: next });
      const added = new Set(page.venues.map((v) => v.id));
      const firstNewAt = next.venues.findIndex((v) => added.has(v.id));
      requestAnimationFrame(() => {
        // Move focus to the first new place so keyboard and screen-reader users land on it.
        const h = listRef.current?.children[firstNewAt >= 0 ? firstNewAt : firstNew]?.querySelector("h3") as
          HTMLElement | null | undefined;
        h?.setAttribute("tabindex", "-1");
        h?.focus();
      });
    } catch (e) {
      if (e instanceof SearchError && e.kind === "expired") void search(opts);
      else setError(e instanceof SearchError ? e.kind : "failed");
    } finally {
      setMoreLoading(false);
    }
  };

  // Hidden places never take a row: they're only counted under the list.
  const venues = useMemo(() => (result?.venues ?? []).filter((v) => !v.dropped), [result]);
  const scale = Math.max(
    30,
    ...venues.filter((v) => !v.dropped).map((v) => v.max),
  );
  // After the one re-sort rows never move. If a row further down turns out fairer (real times) than one above it,
  // a small hint points to it instead of jumping.
  const fairerBelow = useMemo(() => {
    if (!result || result.fill !== "done") return null;
    // Only rows beyond the top 3 that became real later and beat #1.
    return fairerBelowId(venues);
  }, [result, venues]);
  // "~ means a rough guess" only while a visible row still has a "~"; drivers keep the traffic note.
  const anyRough = venues.some((v) => v.per.some((p) => p.estimate));
  const anyCar = hasPlan && plan.people.some((p) => p.mode === "car");
  const wider = WIDER[opts.radiusScale];
  const exhausted = result !== null && !result.more;

  const pins = useMemo<MapPin[]>(() => {
    if (!hasPlan) return [];
    const starts: MapPin[] = plan.people.map((p, i) => ({
      id: p.id,
      lat: p.place!.lat,
      lon: p.place!.lon,
      kind: "person",
      index: i,
      label: nameOf(i),
    }));
    const places: MapPin[] = venues.flatMap((v, i) =>
      v.dropped
        ? []
        : [{ id: v.id, lat: v.lat, lon: v.lon, kind: "place" as const, rank: i + 1, label: `${i + 1}. ${venueNames(v, lang).name}` }],
    );
    return [...starts, ...places];
  }, [hasPlan, plan.people, venues, nameOf, lang]);

  const fixes = useMemo(() => {
    if (!result || result.total > 0) return [];
    const list: { label: string; run: () => void }[] = [];
    const toCarIdx = plan.people.findIndex((p) => p.mode !== "car");
    if (result.blocker === "cap") {
      if (opts.capBonus === 0)
        list.push({
          label: t("fixAllow30"),
          run: () => void search({ ...opts, capBonus: 30 }),
        });
      if (toCarIdx >= 0)
        list.push({
          label: t("fixToCar", { name: nameOf(toCarIdx) }),
          run: () =>
            update((p) => ({
              ...p,
              people: p.people.map((x, i) =>
                i === toCarIdx ? { ...x, mode: "car" } : x,
              ),
            })),
        });
    }
    if (result.blocker === "shabbat_transit") {
      const transitIdx = plan.people.findIndex((p) => p.mode === "transit");
      if (transitIdx >= 0)
        list.push({
          label: t("fixToCar", { name: nameOf(transitIdx) }),
          run: () =>
            update((p) => ({
              ...p,
              people: p.people.map((x, i) =>
                i === transitIdx ? { ...x, mode: "car" } : x,
              ),
            })),
        });
    }
    if (result.blocker === "no_ride_home" || result.blocker === "no_service") {
      const who = result.hidden?.noRideWho ?? -1;
      const idx =
        who >= 0 && plan.people[who]?.mode === "transit"
          ? who
          : plan.people.findIndex((p) => p.mode === "transit");
      if (idx >= 0)
        list.push({
          label: t("fixToCar", { name: nameOf(idx) }),
          run: () =>
            update((p) => ({
              ...p,
              people: p.people.map((x, i) =>
                i === idx ? { ...x, mode: "car" } : x,
              ),
            })),
        });
    }
    if (
      result.blocker === "kosher" ||
      result.blocker === "shabbat" ||
      (result.blocker === "no_places" && plan.kosher)
    )
      list.push({
        label: t("fixKosherOff"),
        run: () => update((p) => ({ ...p, kosher: false })),
      });
    if (
      [
        "no_places",
        "few_places",
        "no_route",
        "kosher",
        "hours",
        "unsafe_route",
        "no_ride_home",
      ].includes(result.blocker ?? "") &&
      wider
    )
      list.push({
        label: t("widerArea"),
        run: () => void search({ ...opts, radiusScale: wider }),
      });
    if (
      ["no_places", "few_places", "hours"].includes(result.blocker ?? "") &&
      list.length < 2
    )
      list.push({
        label: t("fixMoreChips"),
        run: () => void navigate({ to: "/" }),
      });
    return list.slice(0, 2);
  }, [
    result,
    plan.people,
    plan.kosher,
    opts,
    wider,
    search,
    update,
    navigate,
    t,
    nameOf,
  ]);

  const anyTransit = plan.people.some((p) => p.mode === "transit");
  const hidden = status === "ready" ? result?.hidden : undefined;
  const blockerWho = (() => {
    const who = result?.hidden?.noRideWho ?? -1;
    const idx =
      who >= 0 ? who : plan.people.findIndex((p) => p.mode === "transit");
    return nameOf(Math.max(0, idx));
  })();
  const shabbat = status === "ready" ? result?.shabbat : undefined;
  const firstFallback = venues.findIndex((v) => v.kosherFallback);
  const hiddenClosed = result?.counts.closed ?? 0;
  const tryAfter = () => {
    if (!shabbat?.tryAt) return;
    const at = shabbat.tryAt;
    update((p) => ({ ...p, meetAt: at }));
  };

  // Only when the 15-minute skip is really on. A dropped or slow lookup only marks its own rows with ~.
  const transitDown = anyTransit && result !== null && status === "ready" && result.transitDown === true;
  const allTransit = plan.people.every((p) => p.mode === "transit");
  const allCar = plan.people.every((p) => p.mode === "car");
  const loadingTimesKey = allTransit ? "loadingTransit" : allCar ? "loadingDrive" : "loadingMixed";
  const banners: ReactNode[] = [];
  if (shabbat?.inside && shabbat.ends)
    banners.push(
      <Banner
        key="shabbat"
        text={t(shabbat.kind === "yomtov" ? "holidayBanner" : "shabbatBanner", { time: "\u2068" + timeOf(shabbat.ends) + "\u2069" })}
      >
        {shabbat.approximate && <p className="text-small text-muted-foreground">{t("shabbatApprox")}</p>}
        {shabbat.tryAt && (
          <button type="button" onClick={tryAfter} className="h-12 rounded-sm bg-ink px-4 text-body font-medium text-on-ink">
            {t(shabbat.kind === "yomtov" ? "holidayTry" : "shabbatTry", { time: "\u2068" + timeOf(shabbat.tryAt) + "\u2069" })}
          </button>
        )}
      </Banner>,
    );
  if (transitDown) banners.push(<Banner key="transit" text={t("transitEstimate")} />);
  if (status === "ready" && firstFallback >= 0) banners.push(<Banner key="kosher" text={t("kosherFallbackBanner")} />);
  const meetEnd = hasPlan ? addMinutes(plan.meetAt!, plan.durationMin) : "";
  const names = plan.people.map((_, i) => nameOf(i));

  return (
    <PageShell>
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-body font-medium underline underline-offset-2">
        <Back className="size-4" aria-hidden="true" />
        {t("editPlan")}
      </Link>
      <h1 className="mt-2 text-title font-bold">{t("results")}</h1>

      {!ready ? null : !hasPlan ? (
        <p className="mt-4 text-muted-foreground">{t("noPlan")}</p>
      ) : (
        <div className="mt-1 flex flex-col gap-4">
          <p className="num text-small text-muted-foreground">
            {t("everyoneArrives", {
              day: formatDayShort(plan.meetAt!, lang),
              time: "\u2068" + timeOf(plan.meetAt!) + "\u2069",
              end: "\u2068" + timeOf(meetEnd) + "\u2069",
            })}
          </p>

          {!online && (
            <p className="flex items-center gap-2 text-small text-warn" role="alert">
              <WifiOff className="size-4" aria-hidden="true" />
              {t("offline")}
            </p>
          )}

          <MapView pins={pins} label={t("resultsMap")} className="h-50" selectedId={selectedId} onSelect={selectFromMap} />

          <div aria-live="polite" className="flex flex-col gap-3">
            {status === "loading" && (
              <p className="flex items-center gap-2 text-body" role="status">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t(stage === "places" ? "loadingPlaces" : loadingTimesKey)}
              </p>
            )}

            {status === "error" && error && (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-4" role="alert">
                <p className="text-body">{t(error === "busy" ? "busy" : error === "places" ? "errPlaces" : "errFailed")}</p>
                <button
                  type="button"
                  onClick={() => void search(opts)}
                  disabled={!online}
                  className="h-12 rounded-sm bg-surface-2 px-4 text-body font-medium disabled:text-muted-foreground"
                >
                  {t("tryAgain")}
                </button>
              </div>
            )}

            {banners.slice(0, 2)}

            {status === "ready" && result && result.total === 0 && (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <p className="text-body text-pretty">
                  {t("zeroTitle", {
                    reason: t(`reason_${result.blocker ?? "no_places"}`, { cap: result.cap, name: blockerWho }),
                  })}
                </p>
                {fixes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {fixes.map((f, i) => (
                      <button
                        key={f.label}
                        type="button"
                        onClick={f.run}
                        className={`h-12 rounded-sm px-4 text-body font-medium ${i === 0 ? "bg-ink text-on-ink" : "bg-surface-2"}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {status === "ready" && result && result.total > 0 && result.batchStart === undefined && (result.fill === "out" || result.fill === "rank") && (
              <p className="flex items-center gap-2 text-body" role="status">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("checkingReal")}
              </p>
            )}

            {status === "ready" && result && result.total > 0 && (
              <>
                {(result.counts.widened ?? 0) > 0 && <p className="text-small text-muted-foreground">{t("widenedNote")}</p>}
                {anyRough ? (
                  <p className="text-small text-muted-foreground text-pretty">{t("estimates")}</p>
                ) : anyCar ? (
                  <p className="text-small text-muted-foreground text-pretty">{t("driveNote")}</p>
                ) : null}
                <p className="text-body font-medium">
                  {result.total === 1 ? t("resultsOne") : t("resultsCount", { n: result.total })}
                </p>
              </>
            )}
          </div>

          {status !== "loading" && venues.length > 0 && (
            <>
              {fairerBelow && (
                <button
                  type="button"
                  onClick={() => selectFromMap(fairerBelow)}
                  className="inline-flex min-h-8 items-center gap-1 self-start text-small text-muted-foreground underline underline-offset-2"
                >
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                  {t("fairerBelow")}
                </button>
              )}
              <ol ref={listRef} className="num flex flex-col gap-3">
                {venues.map((v, i) => (
                  <ResultRow
                    key={v.id}
                    venue={v}
                    index={i}
                    scale={scale}
                    showKosher={plan.kosher}
                    fill={result?.fill ?? "done"}
                    onRetry={checkHome}
                    retrying={rowBusy.has(v.id)}
                    homeState={homeState.get(v.id) ?? "idle"}
                    names={names}
                    meetEnd={meetEnd}
                    transitFirst={anyTransit}
                    allTransit={allTransit}
                    selected={selectedId === v.id}
                    onSelect={onRowTap}
                  />
                ))}
              </ol>

              {!exhausted ? (
                <button
                  type="button"
                  onClick={() => void onMore()}
                  disabled={moreLoading || !online}
                  className="h-12 w-full rounded-sm bg-surface-2 text-body font-medium disabled:text-muted-foreground"
                >
                  {moreLoading ? t("loadingMore") : t("loadMore")}
                </button>
              ) : wider ? (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-small">{t("exhausted")}</p>
                  <button
                    type="button"
                    onClick={() => void search({ ...opts, radiusScale: wider })}
                    disabled={!online}
                    className="h-12 rounded-sm bg-surface-2 px-4 text-body font-medium disabled:text-muted-foreground"
                  >
                    {t("widerArea")}
                  </button>
                </div>
              ) : (
                <p className="text-small text-muted-foreground">{t("widestReached")}</p>
              )}
            </>
          )}

          {status === "ready" && venues.length > 0 && (
            <div className="flex flex-col gap-1 text-small text-muted-foreground text-pretty">
              {hiddenClosed > 0 && <p>{t("hiddenClosed", { n: hiddenClosed })}</p>}
              {hidden && hidden.noRideHome > 0 && <p>{t("hiddenNoRideHome", { n: hidden.noRideHome })}</p>}
              {hidden && hidden.noService > 0 && <p>{t("hiddenNoService", { n: hidden.noService })}</p>}
              {hidden && hidden.unsafeRoute > 0 && <p>{t("hiddenUnsafe", { n: hidden.unsafeRoute })}</p>}
              {hidden && hidden.tooFar > 0 && <p>{t("hiddenTooFar", { n: hidden.tooFar })}</p>}
              {hidden && (hidden.unverified ?? 0) > 0 && <p>{t("hiddenUnverified", { n: hidden.unverified ?? 0 })}</p>}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
