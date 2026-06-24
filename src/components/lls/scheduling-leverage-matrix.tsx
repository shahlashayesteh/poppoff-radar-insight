// Scheduling Leverage Matrix — manager-only UI section.
// Renders under /manager/lls. Never imported by /server/* routes.

import type {
  SchedulingLeverageResult,
  ServerShiftCell,
  ServerRecommendation,
  CellLabel,
} from "@/lib/lls/scheduling-leverage";
import { MetricTooltip, DataQualityChip, ModelledValueLabel } from "@/components/metrics";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYPARTS = ["breakfast", "brunch", "lunch", "dinner", "late"];

function cellTone(label: CellLabel): string {
  switch (label) {
    case "best_fit":
      return "bg-brand-green/25 text-brand-green border-brand-green/40";
    case "good_fit":
      return "bg-brand-green/10 text-brand-green border-brand-green/30";
    case "test_monitor":
      return "bg-brand-orange/15 text-brand-orange border-brand-orange/30";
    case "avoid_for_now":
      return "bg-[color:var(--opportunity)]/15 text-[color:var(--opportunity)] border-[color:var(--opportunity)]/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
function cellAbbrev(label: CellLabel): string {
  switch (label) {
    case "best_fit":
      return "Best";
    case "good_fit":
      return "Good";
    case "test_monitor":
      return "Test";
    case "avoid_for_now":
      return "Avoid";
    default:
      return "—";
  }
}
function confidenceLabel(b: string): string {
  return b === "high" ? "High" : b === "medium" ? "Medium" : b === "low" ? "Low" : "Insufficient";
}
function fmtMoney(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(0)}`;
}

function HighlightCard({
  title,
  tooltip,
  rec,
}: {
  title: string;
  tooltip: string;
  rec: ServerRecommendation | null;
}) {
  return (
    <div className="rounded-2xl bg-white border border-border p-4 flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        <MetricTooltip
          name={title}
          description={tooltip}
          formula="Scheduling Leverage Engine — see methodology tooltip on the matrix below"
          sourceFields={["fit_score", "rota_test_priority", "modelled_revenue_lift"]}
          provenance="derived"
        >
          <span className="cursor-help underline decoration-dotted">{title}</span>
        </MetricTooltip>
      </div>
      {rec ? (
        <>
          <div className="font-display text-lg font-bold leading-tight">{rec.server_name}</div>
          <div className="text-sm">{rec.best_fit_shift}</div>
          <div className="text-xs text-muted-foreground">{rec.why}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span>Modelled lift {fmtMoney(rec.modelled_opportunity)}</span>
            <ModelledValueLabel kind="modelled" />
            <span className="text-muted-foreground">· Confidence: {confidenceLabel(rec.confidence)}</span>
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground italic">
          Not enough comparable shifts yet — upload more weeks of data to surface this signal.
        </div>
      )}
    </div>
  );
}

export function SchedulingLeverageMatrix({ data }: { data: SchedulingLeverageResult }) {
  const h = data.highlights;

  // Build matrix lookup: server -> day-of-week+daypart -> cell
  const cellBy = new Map<string, ServerShiftCell>();
  for (const c of data.matrix) cellBy.set(`${c.server_id}|${c.shift_type}`, c);

  // Column list: day of week × daypart that actually has shifts
  const presentTypes = new Map<string, { dow: number; daypart: string; key: string }>();
  for (const t of data.shift_types) {
    const k = `${t.day_of_week}|${t.daypart}`;
    if (!presentTypes.has(k)) presentTypes.set(k, { dow: t.day_of_week, daypart: t.daypart, key: t.key });
  }
  const cols = Array.from(presentTypes.values()).sort((a, b) =>
    a.dow !== b.dow ? a.dow - b.dow : DAYPARTS.indexOf(a.daypart) - DAYPARTS.indexOf(b.daypart),
  );

  return (
    <div className="mt-6 rounded-2xl bg-white border border-border p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-bold">Scheduling Leverage Matrix</h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            LLS shows revenue created per unit of labour cost, adjusted for shift opportunity.
            This matrix goes one step further: it identifies where each server is likely to
            create the greatest <strong>marginal</strong> value compared with what that shift
            normally delivers. The best rota decision is not always where the server performs
            highest in absolute terms — it is where they create the biggest improvement vs.
            baseline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-muted-foreground">
            {data.data_quality.matched_for_lls}/{data.data_quality.rows_total} rows matched for LLS
          </span>
          {data.data_quality.rows_with_hours < data.data_quality.rows_total * 0.5 && (
            <DataQualityChip kind="missing-field" />
          )}
          {data.data_quality.rows_total < 30 && (
            <DataQualityChip kind="low-sample" count={data.data_quality.rows_total} />
          )}
          {!data.data_quality.has_category && (
            <DataQualityChip kind="estimated-value" />
          )}
        </div>
      </div>

      {/* Highlight cards */}
      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HighlightCard
          title="Best overall labour leverage"
          tooltip="Highest Fit Score across all (server × shift type) cells — strongest projected adjusted-LLS performance vs venue benchmark."
          rec={h.best_overall_leverage}
        />
        <HighlightCard
          title="Best slow shift revenue lifter"
          tooltip="Top rota-test priority on a shift with high commercial headroom — i.e. where the server creates the biggest improvement vs. a weaker baseline."
          rec={h.best_slow_shift_lifter}
        />
        <HighlightCard
          title="Best peak shift performer"
          tooltip="Holds throughput and Adjusted LLS above the venue baseline on high-opportunity shifts."
          rec={h.best_peak_performer}
        />
        <HighlightCard
          title="Best RPC builder"
          tooltip="Highest projected revenue per cover vs venue baseline — best suited to premium / wine-led / tasting service."
          rec={h.best_rpc_builder}
        />
        <HighlightCard
          title="Best throughput handler"
          tooltip="Highest covers-per-hour with RPH at or above baseline — best suited to breakfast, casual high-turnover, beach/terrace."
          rec={h.best_throughput}
        />
        <HighlightCard
          title="Most underused capability"
          tooltip="Strong projected fit on a shift type they are rarely scheduled on. Test by adding 1–2 shifts."
          rec={h.most_underused}
        />
        <HighlightCard
          title="Biggest coaching opportunity"
          tooltip="Below benchmark on a shift type they are heavily scheduled on — coachable gap or potential mismatch."
          rec={h.biggest_coaching_opportunity}
        />
      </div>

      {/* Shift match recommendations */}
      {data.recommendations.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base font-bold">Shift match recommendations</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-3">Server</th>
                  <th className="text-left py-2 pr-3">Recommendation</th>
                  <th className="text-left py-2 pr-3">Current pattern</th>
                  <th className="text-left py-2 pr-3">Best fit shift</th>
                  <th className="text-left py-2 pr-3">Why</th>
                  <th className="text-left py-2 pr-3">Suggested rota test</th>
                  <th className="text-right py-2 pr-3">Modelled opportunity</th>
                  <th className="text-right py-2 pr-3">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.recommendations.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 align-top">
                    <td className="py-2 pr-3 font-semibold">{r.server_name}</td>
                    <td className="py-2 pr-3 text-xs capitalize">
                      {r.recommendation_type.replace(/_/g, " ")}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.current_pattern}</td>
                    <td className="py-2 pr-3 text-xs">{r.best_fit_shift}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.why}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {r.suggested_rota_test}
                    </td>
                    <td className="py-2 pr-3 text-right text-xs whitespace-nowrap">
                      {fmtMoney(r.modelled_opportunity)} <ModelledValueLabel kind="modelled" />
                    </td>
                    <td className="py-2 pr-3 text-right text-xs">{confidenceLabel(r.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rota opportunity matrix */}
      {cols.length > 0 && data.servers.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base font-bold">Rota opportunity matrix</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each cell shows the projected fit for that server on that shift type. Hover for
            Fit Score, Rota-Test Priority, projected RPC / RPH / Adjusted LLS, modelled lift,
            and main reason.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 sticky left-0 bg-white">Server</th>
                  {cols.map((c) => (
                    <th key={c.key} className="text-center py-2 px-1 min-w-[78px]">
                      <div className="font-semibold">{DAY_NAMES[c.dow]}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">{c.daypart}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.servers.map((s) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-1.5 pr-3 font-semibold sticky left-0 bg-white">{s.name}</td>
                    {cols.map((c) => {
                      const cell = cellBy.get(`${s.id}|${c.key}`);
                      if (!cell) {
                        return (
                          <td key={c.key} className="text-center py-1 px-1">
                            <span className="inline-block w-full text-muted-foreground">—</span>
                          </td>
                        );
                      }
                      const tip = [
                        `Fit Score: ${cell.fit_score.toFixed(0)}/100`,
                        `Rota Test Priority: ${cell.rota_test_priority.toFixed(0)}`,
                        `Projected RPC: ${cell.projected_rpc != null ? cell.projected_rpc.toFixed(2) : "—"}`,
                        `Projected RPH: ${cell.projected_rph != null ? cell.projected_rph.toFixed(2) : "—"}`,
                        `Projected Adj. LLS: ${cell.projected_adjusted_lls != null ? cell.projected_adjusted_lls.toFixed(2) : "—"}`,
                        `Modelled Revenue Lift: ${fmtMoney(cell.modelled_revenue_lift)}`,
                        `Confidence: ${confidenceLabel(cell.confidence_band)}`,
                        cell.reasons[0] ? `Why: ${cell.reasons[0]}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n");
                      return (
                        <td key={c.key} className="text-center py-1 px-1">
                          <span
                            title={tip}
                            className={`inline-block w-full rounded-md border px-1.5 py-1 text-[11px] font-semibold cursor-help ${cellTone(cell.cell_label)}`}
                          >
                            {cellAbbrev(cell.cell_label)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-brand-green/25" /> Best fit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-brand-green/10" /> Good fit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-brand-orange/15" /> Test or monitor
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-[color:var(--opportunity)]/15" />
              Avoid for now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-muted" /> Insufficient data
            </span>
          </div>
        </div>
      )}

      {/* Manager guardrails */}
      <div className="mt-6 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Manager guardrails</div>
        <div>
          Recommendations are directional, not automatic rota decisions. Always weigh availability,
          contracted hours, fairness, burnout risk, rest days, role seniority, section knowledge,
          and guest experience.
        </div>
        <div>
          Availability and contracted hours are not currently in PoppOff — confirm against your
          rota system before scheduling.
        </div>
        {data.data_quality.notes.map((n, i) => (
          <div key={i}>· {n}</div>
        ))}
      </div>
    </div>
  );
}
