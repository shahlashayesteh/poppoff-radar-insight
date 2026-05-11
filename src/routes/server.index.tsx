import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { claimServerCsvData, recordLogin } from "@/lib/server-data";
import { Trophy, Flame, ArrowRight, TrendingDown } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";
import { fetchCategoriesForWeek, fetchCategoryStatsForUser, formatCategoryValue, type VenueCategory, type CategoryStat } from "@/lib/categories";

export const Route = createFileRoute("/server/")({ component: ServerDashboard });

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

function ServerDashboard() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [hasStats, setHasStats] = useState(false);
  const [streak, setStreak] = useState(0);
  const [categories, setCategories] = useState<VenueCategory[]>([]);
  const [cur, setCur] = useState<Record<string, CategoryStat>>({});
  const [prev, setPrev] = useState<Record<string, CategoryStat>>({});
  const [targets, setTargets] = useState<Record<string, number>>({});
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

      const vcats = await fetchCategoriesForWeek(venueId, visibleWeek);
      setCategories(vcats);
      const curRows = await fetchCategoryStatsForUser(venueId, u.user.id, visibleWeek);
      setCur(Object.fromEntries(curRows.map((r) => [r.category_key, r])));
      setHasStats(curRows.length > 0);

      const { data: prevWeekRow } = await (supabase as any)
        .from("server_category_stats")
        .select("week_start")
        .eq("user_id", u.user.id).eq("venue_id", venueId)
        .lt("week_start", visibleWeek)
        .order("week_start", { ascending: false }).limit(1).maybeSingle();
      const prevWeek = (prevWeekRow as any)?.week_start;
      if (prevWeek) {
        const prevRows = await fetchCategoryStatsForUser(venueId, u.user.id, prevWeek);
        setPrev(Object.fromEntries(prevRows.map((r) => [r.category_key, r])));
      }

      const { data: ct } = await (supabase as any).from("server_category_targets").select("category_key, target").eq("venue_id", venueId).eq("user_id", u.user.id);
      setTargets(Object.fromEntries((ct ?? []).map((r: any) => [r.category_key, Number(r.target) || 0])));

      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setStreak((sk as any)?.current_streak ?? 0);
      await supabase.from("server_stat_views").insert({ user_id: u.user.id, venue_id: venueId, week_start: visibleWeek });
    })();
  }, [weekStart]);

  const toneFor = (actual: number, tgt: number) => {
    const colour = performanceColour(actual, tgt);
    return colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
  };

  const top3 = categories.slice(0, 3);

  const rows = categories.map((c) => {
    const curSales = Number(cur[c.key]?.sales ?? 0);
    const prevSales = Number(prev[c.key]?.sales ?? 0);
    const delta = prevSales > 0 ? ((curSales - prevSales) / prevSales) * 100 : null;
    const conv = Number(cur[c.key]?.conversion ?? 0);
    const tgt = Number(targets[c.key] ?? 0);
    const ratio = tgt > 0 ? conv / tgt : 1;
    return { label: c.label, key: c.key, delta, ratio, conv, tgt };
  });

  let smashed: { label: string; delta: number } | null = null;
  let workOn: { label: string; delta: number | null } | null = null;
  if (hasStats && rows.length) {
    const positives = rows.filter((r) => r.delta !== null && r.delta > 0) as { label: string; delta: number }[];
    if (positives.length) {
      const best = positives.reduce((a, b) => (b.delta > a.delta ? b : a));
      smashed = { label: best.label, delta: best.delta };
    }
    const withDelta = rows.filter((r) => r.delta !== null) as { label: string; delta: number; ratio: number }[];
    if (withDelta.length) {
      const allPositive = withDelta.every((r) => r.delta >= 0);
      if (allPositive) {
        const worstByRatio = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
        workOn = { label: worstByRatio.label, delta: worstByRatio.delta };
      } else {
        const worst = withDelta.reduce((a, b) => (b.delta < a.delta ? b : a));
        workOn = { label: worst.label, delta: worst.delta };
      }
    } else {
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
        <div className="mt-3 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>
      </div>

      <div className="px-5 mt-5">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">Your Top 3</div>
          {hasStats ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {top3.map((c) => {
                const actualConv = Number(cur[c.key]?.conversion ?? 0);
                const tgt = Number(targets[c.key] ?? 0);
                const tone = toneFor(actualConv, tgt);
                const fillPct = tgt > 0 ? (actualConv / tgt) * 100 : actualConv;
                const sales = Number(cur[c.key]?.sales ?? 0);
                const prevSales = Number(prev[c.key]?.sales ?? 0);
                const d = prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : null;
                return (
                  <div key={c.key} className="flex flex-col items-center">
                    <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                    <Ring fillPct={fillPct} color={tone} displayValue={`${actualConv.toFixed(0)}%`} />
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

      {hasStats && smashed && (
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

      {hasStats && workOn && (
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
