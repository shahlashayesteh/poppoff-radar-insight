import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import {
  claimServerCsvData,
  recordLogin,
  pctDelta,
  estimateItemsSold,
  fetchVenueAvgPrices,
  loadServerCategoryRows,
  type CategoryKey,
  type ServerCatRow,
} from "@/lib/server-data";
import { Trophy, Flame, ArrowRight, TrendingDown, Sparkles } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";

export const Route = createFileRoute("/server/")({ component: ServerDashboard });

type Stat = any;
type Targets = any;

function Ring({ fillPct, color, displayValue }: { fillPct: number; color: string; displayValue: string | number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, fillPct)) / 100) * c;
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={`color-mix(in oklab, ${color} 18%, white)`} strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-3xl font-bold leading-none text-foreground">{displayValue}</span>
      </div>
    </div>
  );
}

const LEGACY_CATS = [
  { key: "wine", label: "wine", conv: "wine_conversion", t: "wine_target", sales: "wine_sales" },
  { key: "cocktail", label: "cocktails", conv: "cocktail_conversion", t: "cocktail_target", sales: "cocktail_sales" },
  { key: "dessert", label: "desserts", conv: "dessert_conversion", t: "dessert_target", sales: "dessert_sales" },
  { key: "sides", label: "sides", conv: "sides_conversion", t: "sides_target", sales: "sides_sales" },
  { key: "spirits", label: "spirits", conv: "spirits_conversion", t: "spirits_target", sales: "spirits_sales" },
  { key: "sparkling", label: "sparkling", conv: "sparkling_conversion", t: "sparkling_target", sales: "sparkling_sales" },
] as const;

function ServerDashboard() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [stat, setStat] = useState<Stat | null>(null);
  const [prevStat, setPrevStat] = useState<Stat | null>(null);
  const [target, setTarget] = useState<Targets | null>(null);
  const [streak, setStreak] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [dynRows, setDynRows] = useState<ServerCatRow[]>([]);
  const [coaching, setCoaching] = useState<{ category: string; tip: string }[] | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);
  const [venueId, setVenueId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const fetchCoaching = useCallback(async (vId: string, uId: string, week: string) => {
    setCoachLoading(true);
    try {
      const { data: cd, error: cErr } = await supabase.functions.invoke("ai-assist", {
        body: { action: "server_coaching", venueId: vId, payload: { userId: uId, weekStart: week } },
      });
      if (cErr) throw cErr;
      setCoaching(Array.isArray(cd?.suggestions) ? cd.suggestions : []);
    } catch {
      setCoaching([]);
    } finally {
      setCoachLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      userIdRef.current = u.user.id;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      const fn = prof?.full_name || "";
      setName(fn.split(" ")[0] || "there");
      await claimServerCsvData();
      await recordLogin();
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const v = vm?.[0]?.venue_id;
      if (!v) return;
      setVenueId(v);
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("user_id", u.user.id).eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setDisplayWeekStart(visibleWeek);
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle();
      setStat(st);
      const { data: prev } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", v).lt("week_start", visibleWeek).order("week_start", { ascending: false }).limit(1).maybeSingle();
      setPrevStat(prev);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", u.user.id).eq("venue_id", v).maybeSingle();
      setTarget(tg);
      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", u.user.id).eq("venue_id", v).maybeSingle();
      setStreak((sk as any)?.current_streak ?? 0);
      setPrices(await fetchVenueAvgPrices(v));
      const rows = await loadServerCategoryRows(v, u.user.id, visibleWeek, prev?.week_start ?? null);
      setDynRows(rows);
      await supabase.from("server_stat_views").insert({ user_id: u.user.id, venue_id: v, week_start: visibleWeek });
      if (st) {
        await fetchCoaching(v, u.user.id, visibleWeek);
      }
    })();
  }, [weekStart, fetchCoaching]);

  // Live refresh coaching when the manager uploads a new menu, regenerates pairings, or invalidates cache
  useEffect(() => {
    if (!venueId) return;
    const uId = userIdRef.current;
    if (!uId) return;
    const refresh = () => { void fetchCoaching(venueId, uId, displayWeekStart); };
    const channel = supabase
      .channel(`coaching:${venueId}:${uId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_menu", filter: `venue_id=eq.${venueId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_pairings", filter: `venue_id=eq.${venueId}` }, refresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "server_coaching", filter: `venue_id=eq.${venueId}` }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [venueId, displayWeekStart, fetchCoaching]);

  const toneFor = (actual: number, tgt: number) => {
    const colour = performanceColour(actual, tgt);
    return colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
  };

  // Delta-driven (week-over-week) bucket for ring colour, fill, role label.
  type DeltaBucket = { tone: string; fillPct: number; role: "Crushing it" | "Could be better" | "Focus here" };
  const deltaBucket = (d: number | null): DeltaBucket => {
    if (d === null || d <= 0) {
      return { tone: "var(--opportunity)", fillPct: Math.min(100, Math.abs(d ?? 0)), role: "Focus here" };
    }
    if (d >= 20) {
      return { tone: "var(--brand-green)", fillPct: Math.min(100, d), role: "Crushing it" };
    }
    return { tone: "var(--brand-orange)", fillPct: Math.min(100, d), role: "Could be better" };
  };

  // Build a unified row list — prefer dynamic venue categories; fall back to
  // legacy six columns on server_stats when the venue hasn't tracked any
  // dynamic categories yet.
  type UniRow = {
    label: string;
    conversion: number;
    prevConversion: number;
    target: number;
    items: number;
    prevItems: number;
  };
  const buildLegacyRows = (): UniRow[] => {
    if (!stat) return [];
    return LEGACY_CATS.map((c) => {
      const conv = Number((stat as any)[c.conv] ?? 0);
      const prevConv = Number((prevStat as any)?.[c.conv] ?? 0);
      const tgt = Number((target as any)?.[c.t] ?? 0);
      const items = estimateItemsSold(Number((stat as any)[c.sales] ?? 0), c.key as CategoryKey, prices);
      const prevItems = prevStat
        ? estimateItemsSold(Number((prevStat as any)[c.sales] ?? 0), c.key as CategoryKey, prices)
        : 0;
      return { label: c.label, conversion: conv, prevConversion: prevConv, target: tgt, items, prevItems };
    });
  };
  // Only prefer dynamic rows when the venue actually has usable data for the
  // visible week — at least one category with a real stat or target. Otherwise
  // fall back to the legacy six-column path so existing venues keep rendering
  // exactly as before.
  // Dynamic path requires real per-category STATS for the visible week, not
  // just targets. Targets alone (e.g. seeded sides=1) would leave every row
  // with items=0 and the Top 3 filter would drop them all. When no category
  // has any actual sales/items/conversion this week, fall back to the legacy
  // six columns on server_stats.
  const hasDynamicData =
    dynRows.length > 0 &&
    dynRows.some((r) => r.conversion > 0 || r.sales > 0 || r.items > 0);
  const uniRows: UniRow[] = hasDynamicData
    ? dynRows.map((r) => ({
        label: r.label,
        conversion: r.conversion,
        prevConversion: r.prevConversion,
        target: r.target,
        items: r.items,
        prevItems: r.prevItems,
      }))
    : buildLegacyRows();

  // Conversion percentage-point delta vs previous week. Returns null when
  // there is no previous-week signal at all (both 0). This is the
  // source-of-truth metric used by coaching insights, so home + stats + the
  // AI tips all speak the same language.
  const convDelta = (r: { conversion: number; prevConversion: number }): number | null => {
    if (!r.prevConversion && !r.conversion) return null;
    return r.conversion - r.prevConversion;
  };

  // Smashed card (best week-over-week conversion gain in percentage points).
  let smashed: { label: string; delta: number } | null = null;
  if (stat && uniRows.length) {
    const positives = uniRows
      .map((r) => ({ label: r.label, d: convDelta(r) }))
      .filter((r) => r.d !== null && (r.d as number) > 0) as { label: string; d: number }[];
    if (positives.length) {
      const best = positives.reduce((a, b) => (b.d > a.d ? b : a));
      smashed = { label: best.label, delta: best.d };
    }
  }

  // Top 3 picker — works on the unified rows.
  type RingRole = "Crushing it" | "Could be better" | "Focus here";
  type Top3Item = {
    label: string;
    role: RingRole;
    conversion: number;
    prevConversion: number;
    target: number;
    items: number;
    prevItems: number;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let top3: Top3Item[] = [];
  let allGreen = false;
  if (stat && uniRows.length) {
    const usable = uniRows
      .map((r) => ({ ...r, ratio: r.target > 0 ? r.conversion / r.target : 0 }))
      .filter((r) => r.target > 0 && r.items > 0)
      .sort((a, b) => b.ratio - a.ratio);

    const picks: UniRow[] = [];
    if (usable.length >= 3) {
      picks.push(usable[0]);
      picks.push(usable[Math.floor(usable.length / 2)]);
      picks.push(usable[usable.length - 1]);
    } else if (usable.length === 2) {
      picks.push(usable[0]);
      picks.push(usable[1]);
    } else if (usable.length === 1) {
      picks.push(usable[0]);
    }

    const roleFromColour = (actual: number, tgt: number): RingRole => {
      const col = performanceColour(actual, tgt);
      if (col === "green") return "Crushing it";
      if (col === "amber") return "Could be better";
      return "Focus here";
    };

    top3 = picks.map((p) => {
      const d = convDelta(p);
      return {
        label: cap(p.label),
        role: deltaBucket(d).role,
        conversion: p.conversion,
        prevConversion: p.prevConversion,
        target: p.target,
        items: p.items,
        prevItems: p.prevItems,
      };
    });
    allGreen =
      top3.length === 3 &&
      top3.every((t) => deltaBucket(convDelta(t)).tone === "var(--brand-green)");
  }

  // Work-on list: red entries from Top 3 only.
  const workOnList = top3
    .map((t) => ({ label: t.label, d: convDelta(t) }))
    .filter((t) => deltaBucket(t.d).tone === "var(--opportunity)");
  const joinLabels = (xs: string[]) =>
    xs.length <= 1
      ? xs.join("")
      : xs.length === 2
        ? `${xs[0]} and ${xs[1]}`
        : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-sm flex items-center gap-2"><span className="text-xl">👋</span><span className="font-medium">Hey {name || "there"}!</span></div>
        <h1 className="mt-4 font-display text-[40px] leading-[1] font-extrabold tracking-tight">
          Stats just<br /><span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <div className="mt-3 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>
      </div>

      <div className="px-5 mt-5">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">Your Top 3</div>
          {stat ? (
            top3.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {top3.map((c) => {
                  const d = pctDelta(c.items, c.prevItems);
                  const bucket = deltaBucket(d);
                  const tone = bucket.tone;
                  const fillPct = bucket.fillPct;
                  return (
                    <div key={c.label} className="flex flex-col items-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: tone }}>{c.role}</div>
                      <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                      <Ring fillPct={fillPct} color={tone} displayValue={c.items} />
                      {d !== null ? (
                        <div className="mt-1 text-xs font-semibold" style={{ color: d >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                          {d >= 0 ? "↑" : "↓"} {d >= 0 ? "+" : "-"}{Math.abs(d).toFixed(0)}%
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted-foreground">—</div>
                      )}
                      <div className="text-[10px] text-muted-foreground">vs last week</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Not enough category data yet — once a few categories have sales and targets we'll highlight your best, average, and focus area.</p>
            )
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No stats for this week yet. Your manager will upload them after service.</p>
          )}
        </div>
      </div>

      {stat && smashed && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-center gap-4"
            style={{
              borderColor: `color-mix(in oklab, var(--brand-green) 40%, transparent)`,
              background: `color-mix(in oklab, var(--brand-green) 8%, white)`,
            }}>
            <Trophy className="h-12 w-12 shrink-0" style={{ color: "var(--brand-green)" }} />
            <div className="flex-1">
              <div className="font-display text-lg font-bold leading-tight">
                You smashed <span style={{ color: "var(--brand-green)" }}>{smashed.label}</span> this week!
              </div>
              <div className="mt-1 text-xs">
                <span className="font-semibold" style={{ color: "var(--brand-green)" }}>+{smashed.delta.toFixed(0)}%</span>{" "}
                <span className="text-muted-foreground">vs last week</span>
              </div>
            </div>
            <div className="h-9 w-9 rounded-full text-white grid place-items-center text-sm" style={{ background: "var(--brand-green)" }}>✓</div>
          </div>
        </div>
      )}

      {stat && !allGreen && workOnList.length > 0 && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-start gap-4"
            style={{
              borderColor: `color-mix(in oklab, var(--opportunity) 40%, transparent)`,
              background: `color-mix(in oklab, var(--opportunity) 8%, white)`,
            }}>
            <TrendingDown className="h-12 w-12 shrink-0" style={{ color: "var(--opportunity)" }} />
            <div className="flex-1">
              <div className="font-display text-lg font-bold leading-tight" style={{ color: "var(--opportunity)" }}>
                You need to work on {joinLabels(workOnList.map((w) => w.label))} this week!
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {workOnList.map((w) => (
                  <li key={w.label}>
                    <span className="font-semibold" style={{ color: "var(--opportunity)" }}>
                      {w.label} {w.d === null ? "—" : `${w.d >= 0 ? "+" : ""}${w.d.toFixed(0)}%`}
                    </span>{" "}
                    <span className="text-muted-foreground">vs last week</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {stat && (coachLoading || (coaching && coaching.length > 0)) && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl bg-white border border-border p-5">
            <div className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-orange" />
              <div className="font-semibold">Your coaching this week</div>
            </div>
            {coachLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Writing tips from your week…</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {coaching!.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-border p-3 flex gap-3">
                    <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 h-fit shrink-0" style={{ background: "color-mix(in oklab, var(--brand-green) 12%, white)", color: "var(--brand-green)" }}>{s.category}</span>
                    <span className="text-sm text-foreground/90">{s.tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="px-5 mt-4 mb-6">
        <Link to="/server/progress" className="block rounded-3xl bg-white border border-border p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-orange/15 grid place-items-center"><Flame className="h-5 w-5 text-brand-orange" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Current streak: {streak} week{streak === 1 ? "" : "s"} 🔥</div>
            <div className="text-xs text-muted-foreground">View milestones & rewards</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </ServerLayout>
  );
}
