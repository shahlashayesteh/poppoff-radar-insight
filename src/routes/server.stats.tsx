import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData, recordLogin, fetchVenueAvgPrices, estimateItemsSold, pctDelta, type CategoryKey } from "@/lib/server-data";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";

export const Route = createFileRoute("/server/stats")({ component: Page });

type Stat = any;
type Target = any;

const cats: { key: string; t: string; sales: string; cat: CategoryKey; label: string }[] = [
  { key: "wine_conversion", t: "wine_target", sales: "wine_sales", cat: "wine", label: "Wine" },
  { key: "cocktail_conversion", t: "cocktail_target", sales: "cocktail_sales", cat: "cocktail", label: "Cocktails" },
  { key: "dessert_conversion", t: "dessert_target", sales: "dessert_sales", cat: "dessert", label: "Desserts" },
  { key: "sides_conversion", t: "sides_target", sales: "sides_sales", cat: "sides", label: "Sides" },
  { key: "spirits_conversion", t: "spirits_target", sales: "spirits_sales", cat: "spirits", label: "Spirits" },
  { key: "sparkling_conversion", t: "sparkling_target", sales: "sparkling_sales", cat: "sparkling", label: "Sparkling" },
];

function Page() {
  const [stat, setStat] = useState<Stat | null>(null);
  const [prevStat, setPrevStat] = useState<Stat | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
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
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).eq("week_start", visibleWeek).maybeSingle();
      setStat(st);
      const { data: prev } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).lt("week_start", visibleWeek).order("week_start", { ascending: false }).limit(1).maybeSingle();
      setPrevStat(prev);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setTarget(tg);
      setPrices(await fetchVenueAvgPrices(venueId));
    })();
  }, [weekStart]);

  const totalItemsCurrent = stat ? cats.reduce((sum, c) => sum + estimateItemsSold(Number(stat[c.sales] ?? 0), c.cat, prices), 0) : 0;
  const totalItemsPrev = prevStat ? cats.reduce((sum, c) => sum + estimateItemsSold(Number(prevStat[c.sales] ?? 0), c.cat, prices), 0) : 0;
  const totalDelta = pctDelta(totalItemsCurrent, totalItemsPrev);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>

        {!stat ? (
          <p className="mt-6 text-sm text-muted-foreground">Your stats will appear here after your manager uploads this week's data.</p>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-white border border-border p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Items sold this week</div>
                <div className="font-display text-2xl font-extrabold">{totalItemsCurrent}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">vs last week</div>
                <div className="font-semibold" style={{ color: totalDelta === null ? "var(--muted-foreground)" : totalDelta >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                  {totalDelta === null ? "—" : `${totalDelta >= 0 ? "↑" : "↓"} ${Math.abs(totalDelta).toFixed(0)}%`}
                </div>
              </div>
            </div>
            {cats.map((c) => {
              const actual = Number(stat[c.key] ?? 0);
              const tgt = Number(target?.[c.t] ?? 0);
              const colour = performanceColour(actual, tgt);
              const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
              const items = estimateItemsSold(Number(stat[c.sales] ?? 0), c.cat, prices);
              const prevItems = prevStat ? estimateItemsSold(Number(prevStat[c.sales] ?? 0), c.cat, prices) : 0;
              const d = pctDelta(items, prevItems);
              return (
                <div key={c.label} className="rounded-2xl bg-white border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-sm font-bold" style={{ color: tone }}>
                      {items} sold
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ServerLayout>
  );
}

