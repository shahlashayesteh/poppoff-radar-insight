import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { claimServerCsvData, recordLogin, pctDelta, estimateItemsSold, fetchVenueAvgPrices, type CategoryKey } from "@/lib/server-data";
import { Trophy, Flame, ArrowRight, TrendingDown } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour } from "@/lib/week";

export const Route = createFileRoute("/server/")({ component: ServerDashboard });

type Stat = any;
type Targets = any;

function Ring({ fillPct, color, displayValue, displayUnit }: { fillPct: number; color: string; displayValue: string | number; displayUnit?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, fillPct)) / 100) * c;
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={`color-mix(in oklab, ${color} 18%, white)`} strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 grid place-items-center flex-col">
        <span className="font-display text-xl font-bold leading-none" style={{ color }}>{displayValue}</span>
        {displayUnit && <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{displayUnit}</span>}
      </div>
    </div>
  );
}

function ServerDashboard() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [stat, setStat] = useState<Stat | null>(null);
  const [prevStat, setPrevStat] = useState<Stat | null>(null);
  const [target, setTarget] = useState<Targets | null>(null);
  const [streak, setStreak] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const weekStart = toISODate(getMondayOfWeek());

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
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).eq("week_start", weekStart).maybeSingle();
      setStat(st);
      const { data: prev } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).lt("week_start", weekStart).order("week_start", { ascending: false }).limit(1).maybeSingle();
      setPrevStat(prev);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setTarget(tg);
      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setStreak((sk as any)?.current_streak ?? 0);
      setPrices(await fetchVenueAvgPrices(venueId));
      await supabase.from("server_stat_views").insert({ user_id: u.user.id, venue_id: venueId, week_start: weekStart });
    })();
  }, [weekStart]);

  const toneFor = (actual: number, tgt: number) => {
    const colour = performanceColour(actual, tgt);
    return colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
  };

  const top3 = [
    { label: "Wine", conv: "wine_conversion", t: "wine_target", sales: "wine_sales", cat: "wine" as CategoryKey },
    { label: "Cocktails", conv: "cocktail_conversion", t: "cocktail_target", sales: "cocktail_sales", cat: "cocktail" as CategoryKey },
    { label: "Desserts", conv: "dessert_conversion", t: "dessert_target", sales: "dessert_sales", cat: "dessert" as CategoryKey },
  ] as const;

  const allCats = [
    { label: "wine", conv: "wine_conversion", t: "wine_target", sales: "wine_sales", cat: "wine" as CategoryKey },
    { label: "cocktails", conv: "cocktail_conversion", t: "cocktail_target", sales: "cocktail_sales", cat: "cocktail" as CategoryKey },
    { label: "desserts", conv: "dessert_conversion", t: "dessert_target", sales: "dessert_sales", cat: "dessert" as CategoryKey },
    { label: "sides", conv: "sides_conversion", t: "sides_target", sales: "sides_sales", cat: "sides" as CategoryKey },
    { label: "spirits", conv: "spirits_conversion", t: "spirits_target", sales: "spirits_sales", cat: "spirits" as CategoryKey },
    { label: "sparkling", conv: "sparkling_conversion", t: "sparkling_target", sales: "sparkling_sales", cat: "sparkling" as CategoryKey },
  ] as const;

  // Compute week-over-week deltas using item counts per category
  let smashed: { label: string; delta: number } | null = null;
  let workOn: { label: string; delta: number | null } | null = null;
  if (stat) {
    const rows = allCats.map((c) => {
      const curItems = estimateItemsSold(Number((stat as any)[c.sales] ?? 0), c.cat, prices);
      const prevItems = prevStat ? estimateItemsSold(Number((prevStat as any)[c.sales] ?? 0), c.cat, prices) : 0;
      const d = pctDelta(curItems, prevItems);
      const actualConv = Number((stat as any)[c.conv] ?? 0);
      const tgt = Number((target as any)?.[c.t] ?? 0);
      const ratio = tgt > 0 ? actualConv / tgt : 1;
      return { label: c.label, d, ratio };
    });
    const positives = rows.filter((r) => r.d !== null && (r.d as number) > 0) as { label: string; d: number; ratio: number }[];
    if (positives.length) {
      const best = positives.reduce((a, b) => (b.d > a.d ? b : a));
      smashed = { label: best.label, delta: best.d };
    }
    const withDelta = rows.filter((r) => r.d !== null) as { label: string; d: number; ratio: number }[];
    if (withDelta.length) {
      const allPositive = withDelta.every((r) => r.d >= 0);
      if (allPositive) {
        const worstByRatio = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
        workOn = { label: worstByRatio.label, delta: worstByRatio.d };
      } else {
        const worst = withDelta.reduce((a, b) => (b.d < a.d ? b : a));
        workOn = { label: worst.label, delta: worst.d };
      }
    } else {
      // No previous data — fall back to lowest target ratio
      const worstByRatio = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
      workOn = { label: worstByRatio.label, delta: null };
    }
  }

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-sm flex items-center gap-2"><span className="text-xl">👋</span><span className="font-medium">Hey {name || "there"}!</span></div>
        <h1 className="mt-4 font-display text-[40px] leading-[1] font-extrabold tracking-tight">
          Stats just<br /><span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <div className="mt-3 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>
      </div>

      <div className="px-5 mt-5">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">Your Top 3</div>
          {stat ? (
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
                    <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                    <Ring fillPct={fillPct} color={tone} displayValue={items} displayUnit="sold" />
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

      {stat && workOn && (
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
