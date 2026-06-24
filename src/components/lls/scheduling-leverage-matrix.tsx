// Scheduling Leverage Matrix — manager-only UI section.
// Renders under /manager/lls. Never imported by /server/* routes.

import type {
  SchedulingLeverageResult,
  ServerShiftCell,
  ServerRecommendation,
  CellLabel,
  RecommendationType,
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
    case "requires_availability":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "avoid_for_now":
      return "bg-[color:var(--opportunity)]/15 text-[color:var(--opportunity)] border-[color:var(--opportunity)]/30";
    case "not_eligible":
      return "bg-zinc-100 text-zinc-500 border-zinc-300 line-through";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
function confidenceLabel(b: string): string {
  return b === "high" ? "High" : b === "medium" ? "Medium" : b === "low" ? "Low" : "Insufficient";
}
function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(0)}`;
}
function recTypeLabel(t: RecommendationType): string {
  switch (t) {
    case "best_overall_leverage": return "Best overall leverage";
    case "slow_shift_lifter": return "Slow-shift lifter";
    case "peak_performer": return "Peak performer";
    case "high_rpc_specialist": return "RPC builder";
    case "throughput_specialist": return "Throughput specialist";
    case "underused_capability": return "Underused capability";
    case "development_shift": return "Development shift";
    case "protect_from_mismatch": return "Protect from mismatch";
  }
}
function testStyleLabel(s: ServerRecommendation["test_style"]): string {
  if (s === "swap") return "Swap within observed pattern";
  if (s === "extra") return "Test one extra shift";
  return "Requires availability confirmation";
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
          formula="Scheduling Leverage Engine — Marginal Deployment Value × Confidence × Schedule Feasibility × (0.7+0.3·Underused) × PositiveLiftGate"
          sourceFields={["marginal_deployment_value", "rota_test_priority", "modelled_marginal_lift", "schedule_feasibility"]}
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
            <span className="text-muted-foreground">· Conf: {confidenceLabel(rec.confidence)}</span>
            {rec.requires_confirmation && (
              <span className="text-amber-700">· Requires availability confirmation</span>
            )}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground italic">
          Not enough comparable shifts — upload more weeks to surface this signal.
        </div>
      )}
    </div>
  );
}

function ScopeChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "ok" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : tone === "ok"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] ${cls}`}>{children}</span>;
}

function ExplanationPanel({ rec }: { rec: ServerRecommendation }) {
  const e = rec.explanation;
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1.5">
      <div><span className="font-semibold">Why this shift:</span> {rec.why}</div>
      <div><span className="font-semibold">Current deployment baseline:</span> {e.current_baseline}</div>
      <div><span className="font-semibold">Projected server result:</span> {e.projected_result}</div>
      <div>
        <span className="font-semibold">Modelled marginal lift:</span> {e.modelled_marginal_lift}{" "}
        <ModelledValueLabel kind="modelled" />
      </div>
      <div><span className="font-semibold">Confidence:</span> {e.confidence}</div>
      <div><span className="font-semibold">Observed rota pattern:</span> {e.observed_pattern}</div>
      <div><span className="font-semibold">Operational note:</span> {e.operational_note}</div>
      <div>
        <span className="font-semibold">Suggested rota test ({testStyleLabel(rec.test_style)}):</span>{" "}
        {rec.suggested_rota_test}
      </div>
    </div>
  );
}

export function SchedulingLeverageMatrix({ data }: { data: SchedulingLeverageResult }) {
  const h = data.highlights;
  const dq = data.data_quality;

  const cellBy = new Map<string, ServerShiftCell>();
  for (const c of data.matrix) cellBy.set(`${c.server_id}|${c.shift_type}`, c);

  const cols = data.shift_types
    .map((t) => ({ key: t.key, outlet: t.outlet, dow: t.day_of_week, daypart: t.daypart }))
    .sort((a, b) => {
      const oa = a.outlet ?? "", ob = b.outlet ?? "";
      if (oa !== ob) return oa.localeCompare(ob);
      if (a.dow !== b.dow) return a.dow - b.dow;
      return DAYPARTS.indexOf(a.daypart) - DAYPARTS.indexOf(b.daypart);
    });

  const scopeText =
    data.matrix_scope === "outlet_scoped"
      ? `Outlet-scoped (${dq.distinct_outlets} outlet${dq.distinct_outlets === 1 ? "" : "s"})`
      : data.matrix_scope === "single_outlet_inferred"
        ? `Single outlet inferred (${data.outlet_inferred_from_file ?? "from file name"})`
        : "Daypart-only fallback";

  const outletBasisText =
    data.outlet_basis === "uploaded"
      ? "Uploaded column"
      : data.outlet_basis === "inferred_from_filename"
        ? "Inferred from file name"
        : data.outlet_basis === "venue_fallback"
          ? "Venue name fallback (outlet column not detected)"
          : "Missing";
  const outletBasisTone: "ok" | "warn" =
    data.outlet_basis === "uploaded" || data.outlet_basis === "inferred_from_filename" ? "ok" : "warn";

  return (
    <div className="mt-6 rounded-2xl bg-white border border-border p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-bold">Scheduling Leverage Matrix</h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
            LLS shows revenue created per unit of labour cost, adjusted for shift opportunity.
            This matrix goes one step further — it compares each server against the baseline for
            each <strong>outlet × shift type</strong> and identifies where a rota change is most
            likely to create marginal value, gated by what is operationally realistic given each
            server's <strong>observed rota pattern</strong>.
          </p>
        </div>
      </div>

      {/* Period / selected-week strip — disambiguates the two windows */}
      <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
        <ScopeChip tone="ok">
          Scheduling Matrix: based on prior {data.period.weeks}-week lookback
          {data.period.start && ` (${data.period.start} → ${data.period.end})`}
        </ScopeChip>
        {data.selected_week_start && (
          <ScopeChip tone={data.selected_week_has_shifts ? "ok" : "warn"}>
            Weekly scorecard: selected week {data.selected_week_start}
            {data.selected_week_has_shifts === false && " (no shifts)"}
          </ScopeChip>
        )}
        {data.selected_week_has_shifts === false && (
          <span className="text-amber-700">
            No shifts in the selected week. Scheduling recommendations below use historical matched data.
          </span>
        )}
      </div>

      {/* Data-used strip */}
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Outlet basis:</span>
          <ScopeChip tone={outletBasisTone}>{outletBasisText}</ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Category:</span>
          <ScopeChip tone={dq.has_category ? "ok" : "warn"}>{dq.has_category ? "Detected" : "Missing — neutral"}</ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Guest checks:</span>
          <ScopeChip tone={dq.has_checks ? "ok" : "default"}>{dq.has_checks ? "Detected" : "Missing"}</ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Match rate:</span>
          <ScopeChip>{dq.matched_for_lls}/{dq.rows_total}</ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Scope:</span>
          <ScopeChip tone={data.matrix_scope === "daypart_only" ? "warn" : "ok"}>{scopeText}</ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Cross-outlet recs:</span>
          <ScopeChip tone={dq.cross_outlet_recommendations_enabled ? "ok" : "default"}>
            {dq.cross_outlet_recommendations_enabled ? "Enabled" : "Disabled (no eligibility confirmed)"}
          </ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Hours:</span>
          <ScopeChip tone={dq.rows_with_hours >= dq.rows_total * 0.5 ? "ok" : "warn"}>
            {dq.rows_with_hours}/{dq.rows_total} rows
          </ScopeChip>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Recommendation style:</span>
          <ScopeChip>Swap within observed pattern preferred; extras require confirmation</ScopeChip>
        </div>
        {dq.rows_total < 30 && <DataQualityChip kind="low-sample" count={dq.rows_total} />}
      </div>

      {/* Peak performer vs Slow shift revenue lifter — core intelligence explainer */}
      <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-border bg-white p-3">
          <div className="font-semibold text-foreground">Peak performer</div>
          <p className="mt-1 text-muted-foreground">
            Holds throughput and Adj. LLS when covers, pressure, or opportunity are high. Use them
            to <em>protect</em> already-busy shifts where execution under load is the limiting factor.
          </p>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <div className="font-semibold text-foreground">Slow-shift revenue lifter</div>
          <p className="mt-1 text-muted-foreground">
            Creates the biggest <em>marginal</em> value on a weaker shift because the current rota
            baseline has more headroom there. The same server can have higher rota-test priority on
            a quiet Tuesday than on a busy Saturday — that is the core PoppOff intelligence.
          </p>
        </div>
      </div>

      {/* Highlight cards */}
      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HighlightCard title="Best overall labour leverage" tooltip="Highest Marginal Deployment Value with positive modelled lift and feasible rota fit." rec={h.best_overall_leverage} />
        <HighlightCard title="Best slow-shift revenue lifter" tooltip="Top rota-test priority on a shift with high commercial headroom — biggest improvement vs current rota baseline." rec={h.best_slow_shift_lifter} />
        <HighlightCard title="Best peak-shift performer" tooltip="Holds throughput and Adj. LLS above baseline on high-opportunity shifts." rec={h.best_peak_performer} />
        <HighlightCard title="Best RPC builder" tooltip="Highest projected revenue per cover vs current rota baseline." rec={h.best_rpc_builder} />
        <HighlightCard title="Best throughput handler" tooltip="Highest covers-per-hour with RPH at or above baseline." rec={h.best_throughput} />
        <HighlightCard title="Most underused capability" tooltip="Strong projected fit on a shift type they are rarely scheduled on." rec={h.most_underused} />
        <HighlightCard title="Biggest coaching opportunity" tooltip="Below benchmark on a shift type they are heavily scheduled on. Coaching, not a revenue recommendation." rec={h.biggest_coaching_opportunity} />
      </div>

      {/* Shift match recommendations — grouped, expandable explanation */}
      {data.recommendations.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base font-bold">Shift match recommendations</h3>
          <p className="text-xs text-muted-foreground">
            Top {data.recommendations.length} actionable rota tests — grouped per (server, shift)
            and ranked by rota-test priority. Click a row to see the full breakdown.
          </p>
          <div className="mt-3 space-y-2">
            {data.recommendations.map((r, i) => (
              <details key={i} className="rounded-md border border-border bg-white open:bg-muted/20">
                <summary className="cursor-pointer list-none p-3 grid grid-cols-12 gap-3 items-start text-xs">
                  <div className="col-span-3 font-semibold text-sm">{r.server_name}</div>
                  <div className="col-span-3">
                    <div className="font-medium">{r.best_fit_shift}</div>
                    <div className="text-[10px] text-muted-foreground">{r.current_pattern}</div>
                  </div>
                  <div className="col-span-3 flex flex-wrap gap-1">
                    {r.recommendation_types.map((t) => (
                      <span key={t} className="inline-block rounded-full bg-brand-green/10 text-brand-green border border-brand-green/30 px-2 py-0.5 text-[10px]">
                        {recTypeLabel(t)}
                      </span>
                    ))}
                  </div>
                  <div className="col-span-2 text-right whitespace-nowrap">
                    <div>{fmtMoney(r.modelled_opportunity)} <ModelledValueLabel kind="modelled" /></div>
                    <div className="text-[10px] text-muted-foreground">Conf {confidenceLabel(r.confidence)}</div>
                  </div>
                  <div className="col-span-1 text-right text-[10px] text-muted-foreground">
                    {r.test_style === "swap" ? "Swap" : r.test_style === "extra" ? "Extra" : "Confirm"}
                  </div>
                </summary>
                <div className="px-3 pb-3">
                  <ExplanationPanel rec={r} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Rota opportunity matrix */}
      {cols.length > 0 && data.servers.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base font-bold">Rota opportunity matrix</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Outlet-scoped where outlet is known. Each cell shows a short reason; hover for full
            Marginal Deployment Value, Rota-Test Priority, projected metrics, headroom, confidence
            and sample.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 sticky left-0 bg-white">Server</th>
                  <th className="text-left py-2 pr-3 sticky left-[120px] bg-white text-[10px] uppercase text-muted-foreground">Pattern</th>
                  {cols.map((c) => (
                    <th key={c.key} className="text-center py-2 px-1 min-w-[120px]">
                      {c.outlet && <div className="text-[10px] text-muted-foreground">{c.outlet}</div>}
                      <div className="font-semibold">{DAY_NAMES[c.dow]}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">{c.daypart}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.servers.map((s) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-1.5 pr-3 font-semibold sticky left-0 bg-white align-top">{s.name}</td>
                    <td className="py-1.5 pr-3 sticky left-[120px] bg-white text-[10px] text-muted-foreground whitespace-nowrap align-top">
                      {s.pattern.pattern_label}
                    </td>
                    {cols.map((c) => {
                      const cell = cellBy.get(`${s.id}|${c.key}`);
                      if (!cell) return <td key={c.key} className="text-center py-1 px-1 align-top"><span className="text-muted-foreground">—</span></td>;
                      const tip = [
                        `Marginal Deployment Value: ${cell.marginal_deployment_value.toFixed(0)}/100`,
                        `Rota-Test Priority: ${cell.rota_test_priority.toFixed(0)}`,
                        `Modelled marginal lift: ${fmtMoney(cell.modelled_marginal_lift)}`,
                        `Projected RPC: ${cell.projected_rpc != null ? cell.projected_rpc.toFixed(2) : "—"}`,
                        `Projected RPH: ${cell.projected_rph != null ? cell.projected_rph.toFixed(2) : "—"}`,
                        `Projected Adj. LLS: ${cell.projected_adjusted_lls != null ? cell.projected_adjusted_lls.toFixed(2) : "—"}`,
                        `Opportunity Need: ${(cell.baseline.opportunity_need * 100).toFixed(0)}%`,
                        `Confidence: ${confidenceLabel(cell.confidence_band)}`,
                        `Sample: ${cell.comparable_shifts} unique shifts / ${cell.comparable_hours.toFixed(1)}h`,
                        `Feasibility: ${(cell.schedule_feasibility * 100).toFixed(0)}% (${cell.outlet_eligibility_reason})`,
                        cell.warnings[0] ? `⚠ ${cell.warnings[0]}` : "",
                      ].filter(Boolean).join("\n");
                      return (
                        <td key={c.key} className="text-center py-1 px-1 align-top">
                          <span
                            title={tip}
                            className={`block w-full rounded-md border px-1.5 py-1 text-[11px] cursor-help ${cellTone(cell.cell_label)}`}
                          >
                            <span className="font-semibold">{cell.cell_label_text}</span>
                            {cell.primary_reason && (
                              <span className="block mt-0.5 text-[10px] font-normal opacity-90 leading-tight">
                                {cell.primary_reason}
                              </span>
                            )}
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
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-brand-green/25" /> Best lift</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-brand-green/10" /> Good fit</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-brand-orange/15" /> Test / monitor</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-100" /> Confirm availability</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[color:var(--opportunity)]/15" /> Avoid (negative lift)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-zinc-100" /> Not outlet eligible</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-muted" /> Insufficient data</span>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Manager guardrails</div>
        <div>
          Recommendations are directional and modelled — never automatic rota decisions. Working
          pattern labels reflect <strong>observed rota behaviour</strong> from unique shifts (not
          raw POS rows), not contractual status.
        </div>
        <div>
          Cross-outlet recommendations are disabled by default. A server is only suggested for an
          outlet where they have history or where you have explicitly marked them as cross-outlet
          eligible.
        </div>
        {data.data_quality.notes.map((n, i) => (<div key={i}>· {n}</div>))}
      </div>
    </div>
  );
}
