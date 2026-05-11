import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      const fn = prof?.full_name || "";
      setName(fn.split(" ")[0] || "there");
      await claimServerCsvData();
      await recordLogin();
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const venueId = vm?.[0]?.venue_id;
      if (!venueId) return;
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("user_id", u.user.id).eq("venue_id", venueId).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setDisplayWeekStart(visibleWeek);
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).eq("week_start", visibleWeek).maybeSingle();
      setStat(st);
      const { data: prev } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).lt("week_start", visibleWeek).order("week_start", { ascending: false }).limit(1).maybeSingle();
      setPrevStat(prev);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setTarget(tg);
      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setStreak((sk as any)?.current_streak ?? 0);
      setPrices(await fetchVenueAvgPrices(venueId));
      const rows = await loadServerCategoryRows(venueId, u.user.id, visibleWeek, prev?.week_start ?? null);
      setDynRows(rows);
      await supabase.from("server_stat_views").insert({ user_id: u.user.id, venue_id: venueId, week_start: visibleWeek });
      if (st) {
        setCoachLoading(true);
        try {
          const { data: cd, error: cErr } = await supabase.functions.invoke("ai-assist", {
            body: { action: "server_coaching", venueId, payload: { userId: u.user.id, weekStart: visibleWeek } },
          });
          if (cErr) throw cErr;
          setCoaching(Array.isArray(cd?.suggestions) ? cd.suggestions : []);
        } catch {
          setCoaching([]);
        } finally {
          setCoachLoading(false);
        }
      }
    })();
  }, [weekStart]);

  const toneFor = (actual: number, tgt: number) => {
    const colour = performanceColour(actual, tgt);
    return colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
  };

  // Build a unified row list — prefer dynamic venue categories; fall back to
  // legacy six columns on server_stats when the venue hasn't tracked any
  // dynamic categories yet.
  type UniRow = {
    label: string;
    conversion: number;
    target: number;
    items: number;
    prevItems: number;
  };
  const buildLegacyRows = (): UniRow[] => {
    if (!stat) return [];
    return LEGACY_CATS.map((c) => {
      const conv = Number((stat as any)[c.conv] ?? 0);
      const tgt = Number((target as any)?.[c.t] ?? 0);
      const items = estimateItemsSold(Number((stat as any)[c.sales] ?? 0), c.key as CategoryKey, prices);
      const prevItems = prevStat
        ? estimateItemsSold(Number((prevStat as any)[c.sales] ?? 0), c.key as CategoryKey, prices)
        : 0;
      return { label: c.label, conversion: conv, target: tgt, items, prevItems };
    });
  };
  const uniRows: UniRow[] =
    dynRows.length > 0
      ? dynRows.map((r) => ({
          label: r.label,
          conversion: r.conversion,
          target: r.target,
          items: r.items,
          prevItems: r.prevItems,
        }))
      : buildLegacyRows();

  // Smashed / work-on cards
  let smashed: { label: string; delta: number } | null = null;
  let workOn: { label: string; delta: number | null } | null = null;
  if (stat && uniRows.length) {
    const enriched = uniRows.map((r) => {
      const d = pctDelta(r.items, r.prevItems);
      const ratio = r.target > 0 ? r.conversion / r.target : 1;
      return { ...r, d, ratio };
    });
    const positives = enriched.filter((r) => r.d !== null && (r.d as number) > 0) as (typeof enriched[number] & { d: number })[];
    if (positives.length) {
      const best = positives.reduce((a, b) => (b.d > a.d ? b : a));
      smashed = { label: best.label, delta: best.d };
    }
    const withDelta = enriched.filter((r) => r.d !== null) as (typeof enriched[number] & { d: number })[];
    if (withDelta.length) {
      const allPositive = withDelta.every((r) => r.d >= 0);
      if (allPositive) {
        const worstByRatio = enriched.reduce((a, b) => (b.ratio < a.ratio ? b : a));
        workOn = { label: worstByRatio.label, delta: worstByRatio.d };
      } else {
        const worst = withDelta.reduce((a, b) => (b.d < a.d ? b : a));
        workOn = { label: worst.label, delta: worst.d };
      }
    } else {
      const worstByRatio = enriched.reduce((a, b) => (b.ratio < a.ratio ? b : a));
      workOn = { label: worstByRatio.label, delta: null };
    }
  }

  // Top 3 picker — works on the unified rows.
  type RingRole = "Crushing it" | "Could be better" | "Focus here";
  type Top3Item = {
    label: string;
    role: RingRole;
    conversion: number;
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

    allGreen = picks.length === 3 && picks.every((p) => performanceColour(p.conversion, p.target) === "green");

    top3 = picks.map((p) => ({
      label: cap(p.label),
      role: roleFromColour(p.conversion, p.target),
      conversion: p.conversion,
      target: p.target,
      items: p.items,
      prevItems: p.prevItems,
    }));
  }

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
                  const actualConv = Number((stat as any)[c.conv] ?? 0);
                  const tgt = Number((target as any)?.[c.t] ?? 0);
                  const tone = toneFor(actualConv, tgt);
                  const fillPct = tgt > 0 ? (actualConv / tgt) * 100 : actualConv;
                  const items = estimateItemsSold(Number((stat as any)[c.sales] ?? 0), c.cat, prices);
                  const prevItems = prevStat ? estimateItemsSold(Number((prevStat as any)[c.sales] ?? 0), c.cat, prices) : 0;
                  const d = pctDelta(items, prevItems);
                  return (
                    <div key={c.label} className="flex flex-col items-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: tone }}>{c.role}</div>
                      <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                      <Ring fillPct={fillPct} color={tone} displayValue={items} />
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

      {stat && !allGreen && workOn && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-center gap-4"
            style={{
              borderColor: `color-mix(in oklab, var(--opportunity) 40%, transparent)`,
              background: `color-mix(in oklab, var(--opportunity) 8%, white)`,
            }}>
            <TrendingDown className="h-12 w-12 shrink-0" style={{ color: "var(--opportunity)" }} />
            <div className="flex-1">
              <div className="font-display text-lg font-bold leading-tight" style={{ color: "var(--opportunity)" }}>
                You need to work on {workOn.label} this week!
              </div>
              {workOn.delta !== null && (
                <div className="mt-1 text-xs">
                  <span className="font-semibold" style={{ color: "var(--opportunity)" }}>
                    {workOn.delta >= 0 ? "+" : ""}{workOn.delta.toFixed(0)}%
                  </span>{" "}
                  <span className="text-muted-foreground">vs last week</span>
                </div>
              )}
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
