import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { useRoleGate } from "@/lib/auth-gate";
import { getMondayOfWeek, toISODate, formatWeekRange, latestStatsWeek } from "@/lib/week";
import {
  loadVenuePerformance,
  type VenuePerformance,
} from "@/lib/performance-engine";
import { engineRagFromPerf } from "@/lib/metrics/server-rag";
import { MetricTooltip, ModelledValueLabel } from "@/components/metrics";
import { OperationsStatusStrip } from "@/components/manager/operations-status-strip";


export const Route = createFileRoute("/manager/team")({ component: TeamPage });

type Member = { id: string; full_name: string | null };

function TeamPage() {
  useRoleGate("manager");
  const [members, setMembers] = useState<Member[]>([]);
  const [perf, setPerf] = useState<VenuePerformance | null>(null);
  const [loginCounts, setLoginCounts] = useState<Record<string, number>>({});
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      const { data: vm } = await supabase.from("venue_members").select("user_id").eq("venue_id", v);
      const ids = (vm ?? []).map((x) => x.user_id);
      let mems: Member[] = [];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        mems = profs ?? [];
      }
      setMembers(mems);
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setDisplayWeekStart(visibleWeek);
      if (ids.length) {
        const venuePerf = await loadVenuePerformance({ venueId: v, weekStart: visibleWeek, userIds: ids });
        setPerf(venuePerf);
      }
      const { data: lg } = await supabase.from("server_logins").select("user_id").eq("venue_id", v);
      const counts: Record<string, number> = {};
      for (const r of (lg ?? [])) counts[r.user_id] = (counts[r.user_id] || 0) + 1;
      setLoginCounts(counts);
    })();
  }, [weekStart]);

  // Rank members by overall engine score, falling back to original order for
  // those without data so the team list stays stable.
  const ranking = perf?.ranked.map((e, i) => ({ id: e.userId, rank: i + 1 })) ?? [];
  const rankById = Object.fromEntries(ranking.map((r) => [r.id, r.rank]));
  const sortedMembers = members.slice().sort((a, b) => (rankById[a.id] ?? 999) - (rankById[b.id] ?? 999));

  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Team</div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">Your servers</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)} · ranked by commercial impact (engine RAG vs benchmark)</div>

        <OperationsStatusStrip />


        {members.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white border border-border p-6 text-sm text-muted-foreground">
            No team members yet. Share your join code from the dashboard.
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMembers.map((m) => {
              const entry = perf?.byUser[m.id];
              const verdict = engineRagFromPerf(entry?.perf);
              const tone = verdict.tone;
              const label = verdict.label;
              const gapText = verdict.gapPct === null
                ? "—"
                : `${verdict.gapPct >= 0 ? "+" : ""}${(verdict.gapPct * 100).toFixed(1)}%`;
              const sales = entry?.perf.totals.sales ?? 0;
              const d4 = entry?.perf.totals.salesDeltaPctVs4wk;
              const influence = entry?.perf.totals.totalRevenueInfluence ?? 0;
              const rank = rankById[m.id];
              return (
                <Link key={m.id} to="/manager/server/$id" params={{ id: m.id }} className="rounded-2xl bg-white border border-border p-5 hover:border-brand-green transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-bold">{m.full_name || "Unnamed"}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: tone }}>{label}{rank ? ` · #${rank}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        vs benchmark
                        <MetricTooltip
                          name="Performance gap vs venue benchmark"
                          description="Weighted gap of this server's net sales vs the modelled expected sales given their shifts."
                          formula="(Σ sales / Σ expected_sales) − 1"
                          sourceFields={["net_sales", "expected_sales"]}
                          provenance="derived"
                          benchmark={{ period: "current week", scope: "venue", basis: "weighted expected sales", weighted: true }}
                        />
                      </div>
                      <div className="font-display text-2xl font-extrabold" style={{ color: tone }}>{gapText}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <MetricTooltip
                      name="Net sales"
                      description="Sum of net sales credited to this server this week."
                      formula="Σ net_sales for server within week"
                      sourceFields={["net_sales"]}
                      provenance="uploaded"
                    >
                      <span className="cursor-help">£{sales.toFixed(0)} sales</span>
                    </MetricTooltip>
                    {d4 !== null && d4 !== undefined && (
                      <> · <span style={{ color: d4 >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>{d4 >= 0 ? "+" : ""}{d4.toFixed(1)}% vs 4wk</span></>
                    )}
                  </div>
                  <div className="mt-1 text-xs inline-flex items-center gap-1.5">
                    <span style={{ color: influence >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                      {influence >= 0 ? "+" : ""}£{influence.toFixed(0)} revenue influence
                    </span>
                    <ModelledValueLabel kind="modelled" />
                    <MetricTooltip
                      name="Revenue influence"
                      description="Modelled £ effect this server's performance had vs. an average baseline server doing the same shifts. Directional — not realised revenue."
                      formula="Σ (actual_sales − expected_sales) across shifts"
                      sourceFields={["net_sales", "expected_sales"]}
                      provenance="derived"
                      notes={["Modelled value — not guaranteed revenue."]}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{loginCounts[m.id] || 0} login{(loginCounts[m.id] || 0) === 1 ? "" : "s"}</div>

                </Link>
              );
            })}

          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
