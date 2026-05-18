import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData, recordLogin } from "@/lib/server-data";
import { getMondayOfWeek, toISODate, formatWeekRange, latestStatsWeek } from "@/lib/week";
import {
  loadServerPerformance,
  formatItems,
  eliteVisual,
  ragFromRing,
  ragColor,
  humanMomentum,
  humanTargetCall,
  humanItemsDelta,
  humanTotalsMomentum,
  type CategoryMetric,
  type ServerPerformance,
  type Rag,
} from "@/lib/performance-engine";

export const Route = createFileRoute("/server/stats")({ component: Page });

function ragLabel(rag: Rag): string {
  if (rag === "green") return "WINNING";
  if (rag === "amber") return "CLOSE";
  return "PUSH";
}

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
  const totalItems = rows.reduce((s, r) => s + r.items, 0);
  const anyEstimated = rows.some((r) => r.quantitySource !== "real");
  const totalsMo = humanTotalsMomentum(perf);

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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">{anyEstimated ? "Items this week (est.)" : "Items this week"}</div>
                  <div className="font-display text-3xl font-extrabold">{totalItems}</div>
                </div>
                {totalsMo && (
                  <div className="text-right">
                    <div
                      className="inline-block rounded-full px-3 py-1.5 text-sm font-bold"
                      style={{
                        color: ragColor(totalsMo.rag),
                        background: `color-mix(in oklab, ${ragColor(totalsMo.rag)} 12%, white)`,
                      }}
                    >
                      {totalsMo.text}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {rows.map((r) => {
              const rag = ragFromRing(r.ringPct, r.target > 0);
              const tone = ragColor(rag);
              const elite = eliteVisual(r.eliteTier);
              const call = humanTargetCall(r);
              const mo = humanMomentum(r);
              const itemsDelta = humanItemsDelta(r);
              return (
                <div
                  key={r.key}
                  className="rounded-2xl bg-white p-4 border-2"
                  style={{
                    borderColor: `color-mix(in oklab, ${tone} 35%, transparent)`,
                    boxShadow: r.eliteTier > 0 ? elite.glow : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: tone }}
                        aria-hidden
                      />
                      <div className="font-semibold">{r.label}</div>
                      <span
                        className="text-[9px] font-extrabold uppercase tracking-wider rounded-full px-1.5 py-0.5"
                        style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, white)` }}
                      >
                        {ragLabel(rag)}
                      </span>
                      {elite.badge && (
                        <span className="text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>
                          {elite.badge}
                        </span>
                      )}
                    </div>
                    <div
                      className="text-sm font-extrabold"
                      style={{ color: tone }}
                      title={r.quantitySource === "real" ? "Real POS quantity" : `Estimated from sales ÷ avg price (${r.quantitySource})`}
                    >
                      {formatItems(r)}
                    </div>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full overflow-hidden" style={{ background: `color-mix(in oklab, ${tone} 14%, white)` }}>
                    <div className="h-full rounded-full" style={{ width: `${r.ringPct}%`, background: tone }} />
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3 text-xs">
                    <div className="text-foreground/80 font-medium">
                      {call ?? mo?.text ?? "—"}
                    </div>
                    {itemsDelta && mo && (
                      <div className="text-right text-muted-foreground shrink-0">{itemsDelta}</div>
                    )}
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
