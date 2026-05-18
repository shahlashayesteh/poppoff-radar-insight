import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData, recordLogin } from "@/lib/server-data";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";
import {
  loadServerPerformance,
  formatItems,
  eliteVisual,
  type CategoryMetric,
  type ServerPerformance,
} from "@/lib/performance-engine";

export const Route = createFileRoute("/server/stats")({ component: Page });

function Page() {
  const [perf, setPerf] = useState<ServerPerformance | null>(null);
  const [hasStat, setHasStat] = useState<boolean>(false);
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
      const { data: st } = await supabase.from("server_stats").select("id").eq("user_id", u.user.id).eq("venue_id", venueId).eq("week_start", visibleWeek).maybeSingle();
      setHasStat(!!st);
      const p = await loadServerPerformance({ venueId, userId: u.user.id, weekStart: visibleWeek });
      setPerf(p);
    })();
  }, [weekStart]);

  const rows: CategoryMetric[] = perf?.rows ?? [];
  const totals = perf?.totals;
  const totalItems = rows.reduce((s, r) => s + r.items, 0);
  const anyEstimated = rows.some((r) => r.quantitySource !== "real");

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>

        {!hasStat ? (
          <p className="mt-6 text-sm text-muted-foreground">Your stats will appear here after your manager uploads this week's data.</p>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-white border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{anyEstimated ? "Items this week (est.)" : "Items this week"}</div>
                  <div className="font-display text-2xl font-extrabold">{totalItems}</div>
                </div>
                <div className="text-right space-y-1">
                  {totals?.salesDeltaPctWoW !== null && totals?.salesDeltaPctWoW !== undefined && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">vs last week</div>
                      <div className="text-sm font-semibold" style={{ color: totals.salesDeltaPctWoW >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                        {totals.salesDeltaPctWoW >= 0 ? "↑" : "↓"} {Math.abs(totals.salesDeltaPctWoW).toFixed(0)}%
                      </div>
                    </div>
                  )}
                  {totals?.salesDeltaPctVs4wk !== null && totals?.salesDeltaPctVs4wk !== undefined && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">vs 4wk avg</div>
                      <div className="text-xs font-semibold" style={{ color: totals.salesDeltaPctVs4wk >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                        {totals.salesDeltaPctVs4wk >= 0 ? "↑" : "↓"} {Math.abs(totals.salesDeltaPctVs4wk).toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {rows.map((r) => {
              const colour = performanceColour(r.current, r.target);
              const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
              const elite = eliteVisual(r.eliteTier);
              return (
                <div key={r.key} className="rounded-2xl bg-white border border-border p-4" style={{ boxShadow: r.eliteTier > 0 ? elite.glow : undefined }}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold flex items-center gap-2">
                      {r.label}
                      {elite.badge && (
                        <span className="text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>
                          {elite.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold" style={{ color: tone }} title={r.quantitySource === "real" ? "Real POS quantity" : `Estimated from sales ÷ avg price (${r.quantitySource})`}>
                      {formatItems(r)}
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full" style={{ width: `${r.ringPct}%`, background: tone }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <div className="text-muted-foreground">
                      {r.current.toFixed(1)}% {r.target > 0 && <>/ {r.target.toFixed(0)}%</>}
                      <span className="ml-2 font-semibold" style={{ color: tone }}>{r.statusLabel}</span>
                    </div>
                    <div className="text-right space-x-3">
                      {r.deltaWoW !== null && (
                        <span style={{ color: r.deltaWoW >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                          {r.deltaWoW >= 0 ? "↑" : "↓"} {Math.abs(r.deltaWoW).toFixed(1)}pp wk
                        </span>
                      )}
                      {r.deltaVs4wk !== null && (
                        <span style={{ color: r.deltaVs4wk >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                          {r.deltaVs4wk >= 0 ? "↑" : "↓"} {Math.abs(r.deltaVs4wk).toFixed(1)}pp 4wk
                        </span>
                      )}
                    </div>
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
