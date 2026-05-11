import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData, recordLogin } from "@/lib/server-data";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";
import { fetchVenueCategories, fetchCategoryStatsForUser, type VenueCategory, type CategoryStat } from "@/lib/categories";

export const Route = createFileRoute("/server/stats")({ component: Page });

function Page() {
  const [categories, setCategories] = useState<VenueCategory[]>([]);
  const [cur, setCur] = useState<Record<string, CategoryStat>>({});
  const [prev, setPrev] = useState<Record<string, CategoryStat>>({});
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [hasStats, setHasStats] = useState(false);
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
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

      const vcats = await fetchVenueCategories(venueId);
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
    })();
  }, [weekStart]);

  const totalSalesCurrent = Object.values(cur).reduce((s, r) => s + Number(r.sales || 0), 0);
  const totalSalesPrev = Object.values(prev).reduce((s, r) => s + Number(r.sales || 0), 0);
  const totalDelta = totalSalesPrev > 0 ? ((totalSalesCurrent - totalSalesPrev) / totalSalesPrev) * 100 : null;

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>

        {!hasStats ? (
          <p className="mt-6 text-sm text-muted-foreground">Your stats will appear here after your manager uploads this week's data.</p>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-white border border-border p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Sales this week</div>
                <div className="font-display text-2xl font-extrabold">£{totalSalesCurrent.toFixed(0)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">vs last week</div>
                <div className="font-semibold" style={{ color: totalDelta === null ? "var(--muted-foreground)" : totalDelta >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                  {totalDelta === null ? "—" : `${totalDelta >= 0 ? "↑" : "↓"} ${Math.abs(totalDelta).toFixed(0)}%`}
                </div>
              </div>
            </div>
            {categories.map((c) => {
              const actual = Number(cur[c.key]?.conversion ?? 0);
              const tgt = Number(targets[c.key] ?? 0);
              const colour = performanceColour(actual, tgt);
              const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
              const sales = Number(cur[c.key]?.sales ?? 0);
              const prevSales = Number(prev[c.key]?.sales ?? 0);
              const d = prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : null;
              return (
                <div key={c.key} className="rounded-2xl bg-white border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-sm font-bold" style={{ color: tone }}>
                      £{sales.toFixed(0)}
                      {d !== null && (
                        <span className="ml-2 text-xs" style={{ color: d >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                          {d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full" style={{ width: `${Math.min(100, actual)}%`, background: tone }} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{actual.toFixed(0)}% conversion / target {tgt.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ServerLayout>
  );
}
