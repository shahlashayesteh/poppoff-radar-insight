// Scheduling Leverage Matrix — manager-only UI section.
// Renders under /manager/lls. Never imported by /server/* routes.
//
// UI principle: clean table first, deep reasoning second. The matrix surfaces
// compact labels only; full reasoning lives in a right-hand drawer (Sheet)
// opened by clicking any row or cell.

import { useState } from "react";
import type {
  SchedulingLeverageResult,
  ServerShiftCell,
  ServerRecommendation,
  CellLabel,
  RecommendationType,
  WorkingPattern,
} from "@/lib/lls/scheduling-leverage";
import { MetricTooltip, DataQualityChip, ModelledValueLabel } from "@/components/metrics";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYPARTS = ["breakfast", "brunch", "lunch", "dinner", "late"];

// ───────────── helpers ─────────────

function cellTone(label: CellLabel): string {
  switch (label) {
    case "best_fit":
      return "bg-brand-green/25 text-brand-green border-brand-green/40 hover:bg-brand-green/35";
    case "good_fit":
      return "bg-brand-green/10 text-brand-green border-brand-green/30 hover:bg-brand-green/20";
    case "test_monitor":
      return "bg-brand-orange/15 text-brand-orange border-brand-orange/30 hover:bg-brand-orange/25";
    case "requires_availability":
      return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
    case "avoid_for_now":
      return "bg-[color:var(--opportunity)]/15 text-[color:var(--opportunity)] border-[color:var(--opportunity)]/30 hover:bg-[color:var(--opportunity)]/25";
    case "not_eligible":
      return "bg-zinc-100 text-zinc-500 border-zinc-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
function cellShort(label: CellLabel): string {
  switch (label) {
    case "best_fit": return "Best";
    case "good_fit": return "Good";
    case "test_monitor": return "Test";
    case "requires_availability": return "Confirm";
    case "avoid_for_now": return "Avoid";
    case "not_eligible": return "—";
    default: return "·";
  }
}
function confidenceLabel(b: string): string {
  return b === "high" ? "High" : b === "medium" ? "Medium" : b === "low" ? "Low" : "Insufficient";
}
function fmtMoney(v: number | null | undefined, currency: string = "£"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  return `${sign}${currency}${Math.abs(v).toFixed(0)}`;
}
function recTypeShort(t: RecommendationType): string {
  switch (t) {
    case "best_overall_leverage": return "Best leverage";
    case "slow_shift_lifter": return "Underused lift";
    case "peak_performer": return "Peak fit";
    case "high_rpc_specialist": return "RPC fit";
    case "throughput_specialist": return "Throughput fit";
    case "underused_capability": return "Underused";
    case "development_shift": return "Coaching";
    case "protect_from_mismatch": return "Avoid";
  }
}
function recTypeLong(t: RecommendationType): string {
  switch (t) {
    case "best_overall_leverage": return "Best overall leverage";
    case "slow_shift_lifter": return "Slow-shift revenue lifter";
    case "peak_performer": return "Peak-shift performer";
    case "high_rpc_specialist": return "RPC builder";
    case "throughput_specialist": return "Throughput specialist";
    case "underused_capability": return "Underused capability";
    case "development_shift": return "Development / coaching shift";
    case "protect_from_mismatch": return "Protect from mismatch";
  }
}
function patternShort(p: WorkingPattern): string {
  if (p === "likely_full_time") return "FT pattern";
  if (p === "likely_part_time") return "PT pattern";
  if (p === "variable") return "Variable";
  return "Unknown";
}
function actionFromTestStyle(rec: ServerRecommendation): string {
  if (rec.recommendation_types.includes("development_shift")) return "Pair for coaching";
  if (rec.recommendation_types.includes("protect_from_mismatch")) return "Avoid for now";
  if (rec.recommendation_types.includes("peak_performer")) return "Protect on peak shift";
  if (rec.test_style === "swap") return "Swap one usual shift";
  if (rec.test_style === "extra") return "Test one extra shift";
  return "Requires availability check";
}
function confidenceTone(c: string): string {
  if (c === "high") return "bg-brand-green/15 text-brand-green border-brand-green/30";
  if (c === "medium") return "bg-brand-orange/15 text-brand-orange border-brand-orange/30";
  if (c === "low") return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-muted text-muted-foreground border-border";
}

// ───────────── small components ─────────────

function ScopeChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "ok" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : tone === "ok"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] ${cls}`}>{children}</span>;
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function HighlightCard({
  title,
  tooltip,
  rec,
  onView,
  currency,
}: {
  title: string;
  tooltip: string;
  rec: ServerRecommendation | null;
  onView: (r: ServerRecommendation) => void;
  currency: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-border p-3 flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        <MetricTooltip
          name={title}
          description={tooltip}
          formula="Scheduling Leverage Engine — Marginal Deployment Value × Confidence × Feasibility"
          sourceFields={["marginal_deployment_value", "rota_test_priority", "modelled_marginal_lift"]}
          provenance="derived"
        >
          <span className="cursor-help underline decoration-dotted">{title}</span>
        </MetricTooltip>
      </div>
      {rec ? (
        <>
          <div className="font-display text-base font-bold leading-tight truncate">{rec.server_name}</div>
          <div className="text-xs text-muted-foreground truncate">{rec.best_fit_shift}</div>
          <div className="flex items-center gap-2 text-[11px] mt-0.5">
            <span className="font-semibold">{fmtMoney(rec.modelled_opportunity, currency)}</span>
            <ModelledValueLabel kind="modelled" />
            <Pill className={confidenceTone(rec.confidence)}>{confidenceLabel(rec.confidence)}</Pill>
          </div>
          <button
            onClick={() => onView(rec)}
            className="mt-1 self-start text-[11px] text-primary hover:underline inline-flex items-center gap-1"
          >
            <Info className="h-3 w-3" /> View why
          </button>
        </>
      ) : (
        <div className="text-xs text-muted-foreground italic">Not enough comparable shifts yet.</div>
      )}
    </div>
  );
}

// ───────────── detail drawer payloads ─────────────

type DrawerPayload =
  | { kind: "rec"; rec: ServerRecommendation }
  | {
      kind: "cell";
      cell: ServerShiftCell;
      server: string;
      shiftLabel: string;
      pattern: string;
    };

function RecommendationDetail({ rec, currency }: { rec: ServerRecommendation; currency: string }) {
  const e = rec.explanation;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {rec.recommendation_types.map((t) => (
          <Pill key={t} className="bg-brand-green/10 text-brand-green border-brand-green/30">{recTypeLong(t)}</Pill>
        ))}
        <Pill className={confidenceTone(rec.confidence)}>{confidenceLabel(rec.confidence)} confidence</Pill>
      </div>

      <Section label="Shift">{rec.best_fit_shift}</Section>
      <Section label="Recommended action">{actionFromTestStyle(rec)}</Section>
      <Section label="Modelled marginal lift">
        <span className="font-semibold">{fmtMoney(rec.modelled_opportunity, currency)}</span>{" "}
        <ModelledValueLabel kind="modelled" />
        <div className="text-xs text-muted-foreground mt-1">{e.modelled_marginal_lift}</div>
      </Section>
      <Section label="Current deployment baseline">{e.current_baseline}</Section>
      <Section label="Projected server result">{e.projected_result}</Section>
      <Section label="Why this shift">{rec.why}</Section>
      <Section label="Observed working pattern">{e.observed_pattern}</Section>
      <Section label="Suggested rota test">{rec.suggested_rota_test}</Section>
      <Section label="Operational note">{e.operational_note}</Section>
      {rec.requires_confirmation && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Requires availability confirmation — recommendation exceeds the server's observed pattern.
        </div>
      )}
    </div>
  );
}

function CellDetail({
  cell,
  server,
  shiftLabel,
  pattern,
  currency,
}: {
  cell: ServerShiftCell;
  server: string;
  shiftLabel: string;
  pattern: string;
  currency: string;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Pill className={`${cellTone(cell.cell_label)} border`}>{cellShort(cell.cell_label)}</Pill>
        <Pill className={confidenceTone(cell.confidence_band)}>{confidenceLabel(cell.confidence_band)} confidence</Pill>
      </div>
      <Section label="Server">{server}</Section>
      <Section label="Shift type">{shiftLabel}</Section>
      <Section label="Modelled marginal lift">
        <span className="font-semibold">{fmtMoney(cell.modelled_marginal_lift, currency)}</span>{" "}
        <ModelledValueLabel kind="modelled" />
      </Section>
      <Section label="Projected metrics">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div>RPC: <span className="font-semibold">{cell.projected_rpc?.toFixed(2) ?? "—"}</span></div>
          <div>RPH: <span className="font-semibold">{cell.projected_rph?.toFixed(2) ?? "—"}</span></div>
          <div>Adj. LLS: <span className="font-semibold">{cell.projected_adjusted_lls?.toFixed(2) ?? "—"}</span></div>
          <div>Throughput: <span className="font-semibold">{cell.projected_cph?.toFixed(2) ?? "—"}</span></div>
        </div>
      </Section>
      <Section label="Opportunity headroom">
        {(cell.baseline.opportunity_need * 100).toFixed(0)}% — how much room exists vs. top performers on this shift
      </Section>
      <Section label="Marginal Deployment Value">{cell.marginal_deployment_value.toFixed(0)}/100</Section>
      <Section label="Rota-Test Priority">{cell.rota_test_priority.toFixed(0)}</Section>
      <Section label="Observed pattern">{pattern}</Section>
      <Section label="Outlet eligibility">{cell.outlet_eligibility_reason}</Section>
      <Section label="Sample">{cell.comparable_shifts} unique shifts · {cell.comparable_hours.toFixed(1)}h</Section>
      {cell.primary_reason && <Section label="Reason">{cell.primary_reason}</Section>}
      {cell.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 space-y-0.5">
          {cell.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ───────────── main component ─────────────

export function SchedulingLeverageMatrix({ data, currency = "£" }: { data: SchedulingLeverageResult; currency?: string }) {
  const h = data.highlights;
  const dq = data.data_quality;
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);

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

  const colLabel = (c: { outlet: string | null; dow: number; daypart: string }) =>
    `${c.outlet ? c.outlet + " · " : ""}${DAY_NAMES[c.dow]} ${c.daypart}`;

  const scopeText =
    data.matrix_scope === "outlet_scoped"
      ? `Outlet-scoped (${dq.distinct_outlets})`
      : data.matrix_scope === "single_outlet_inferred"
        ? `Single outlet`
        : "Daypart-only fallback";

  const outletBasisText =
    data.outlet_basis === "uploaded" ? "Uploaded"
      : data.outlet_basis === "inferred_from_filename" ? "Inferred from file"
      : data.outlet_basis === "venue_fallback" ? "Venue fallback"
      : "Missing";
  const outletBasisTone: "ok" | "warn" =
    data.outlet_basis === "uploaded" || data.outlet_basis === "inferred_from_filename" ? "ok" : "warn";

  const missingOutlet = data.outlet_basis === "venue_fallback" || data.outlet_basis === "missing";
  const missingRotaData = true; // PoppOff has no contracted hours / availability / rest-rule feed yet

  return (
    <div
      className="mt-6 rounded-2xl bg-white border border-border p-6"
      data-testid="historical-shift-match-intelligence"
    >
      {/* Heading */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-lg font-bold">Historical Shift Match Intelligence</h2>
            <Pill className="bg-amber-100 text-amber-800 border-amber-300">
              Not full rota optimisation yet
            </Pill>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Uses past shift data to suggest where server strengths may be underused.
            Recommendations are suggested tests, not guaranteed outcomes — confirm availability,
            contracted hours and outlet eligibility before changing the rota.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ScopeChip tone="ok">Matrix: prior {data.period.weeks}w lookback</ScopeChip>
          {data.selected_week_start && (
            <ScopeChip tone={data.selected_week_has_shifts ? "ok" : "warn"}>
              Week {data.selected_week_start}{data.selected_week_has_shifts === false && " · no shifts"}
            </ScopeChip>
          )}
        </div>
      </div>

      {missingRotaData && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Data quality:</strong> no rota, availability, contracted-hours or rest-rule data yet.
          Treat every recommendation as a <em>suggested test</em> a manager must approve, not a rota instruction.
          Commercial lift figures are <em>estimated/modelled</em>, never guaranteed revenue.
        </div>
      )}
      {missingOutlet && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Outlet missing:</strong> outlet / revenue centre could not be confirmed from the upload.
          Cross-outlet recommendations are blocked until outlet history or manager eligibility exists.
        </div>
      )}

      {data.selected_week_has_shifts === false && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No shifts in the selected week. The matrix below uses the prior {data.period.weeks} weeks of matched historical data.
        </div>
      )}

      {/* Data-used strip — compact badges only */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-muted-foreground">Data:</span>
        <ScopeChip tone={outletBasisTone}>Outlet · {outletBasisText}</ScopeChip>
        <ScopeChip tone={dq.has_category ? "ok" : "warn"}>Category · {dq.has_category ? "yes" : "missing"}</ScopeChip>
        <ScopeChip tone={dq.has_checks ? "ok" : "default"}>Checks · {dq.has_checks ? "yes" : "missing"}</ScopeChip>
        <ScopeChip>Match {dq.matched_for_lls}/{dq.rows_total}</ScopeChip>
        <ScopeChip tone={data.matrix_scope === "daypart_only" ? "warn" : "ok"}>Scope · {scopeText}</ScopeChip>
        <ScopeChip>Cross-outlet · {dq.cross_outlet_recommendations_enabled ? "on" : "off"}</ScopeChip>
        {dq.rows_total < 30 && <DataQualityChip kind="low-sample" count={dq.rows_total} />}
        {dq.notes.length > 0 && (
          <details className="ml-1">
            <summary className="cursor-pointer text-[11px] text-primary hover:underline">Data notes</summary>
            <div className="mt-1 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-0.5">
              {dq.notes.map((n, i) => <div key={i}>· {n}</div>)}
            </div>
          </details>
        )}
      </div>

      {/* Highlight cards — compact, no paragraphs */}
      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HighlightCard currency={currency} title="Best overall leverage" tooltip="Highest Marginal Deployment Value with positive modelled lift." rec={h.best_overall_leverage} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
        <HighlightCard currency={currency} title="Slow-shift lifter" tooltip="Biggest improvement vs current rota baseline on a quieter shift." rec={h.best_slow_shift_lifter} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
        <HighlightCard currency={currency} title="Peak-shift performer" tooltip="Holds throughput and Adj. LLS above baseline on high-opportunity shifts." rec={h.best_peak_performer} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
        <HighlightCard currency={currency} title="RPC builder" tooltip="Highest projected revenue per cover vs current rota baseline." rec={h.best_rpc_builder} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
        <HighlightCard currency={currency} title="Throughput handler" tooltip="Highest covers per hour with RPH at or above baseline." rec={h.best_throughput} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
        <HighlightCard currency={currency} title="Most underused" tooltip="Strong projected fit on a shift type they are rarely scheduled on." rec={h.most_underused} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
        <HighlightCard currency={currency} title="Coaching opportunity" tooltip="Below benchmark on a shift type they are heavily scheduled on." rec={h.biggest_coaching_opportunity} onView={(r) => setDrawer({ kind: "rec", rec: r })} />
      </div>

      {/* Shift match recommendations — clean table */}
      {data.recommendations.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base font-bold">Suggested shift-match tests</h3>
          <p className="text-xs text-muted-foreground">
            Top {data.recommendations.length} <em>suggested tests</em> based on historical shift data,
            ranked by rota-test priority. Each requires manager review of availability, contracted hours
            and outlet eligibility before any rota change.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 w-8">#</th>
                  <th className="text-left py-2 pr-3">Server</th>
                  <th className="text-left py-2 pr-3">Recommendation</th>
                  <th className="text-left py-2 pr-3">Best shift</th>
                  <th className="text-left py-2 pr-3">Action</th>
                  <th className="text-right py-2 pr-3">Modelled lift</th>
                  <th className="text-center py-2 pr-3">Conf.</th>
                  <th className="text-left py-2 pr-3">Pattern</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.recommendations.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3 font-semibold">{r.server_name}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {r.recommendation_types.slice(0, 2).map((t) => (
                          <Pill key={t} className="bg-brand-green/10 text-brand-green border-brand-green/30">{recTypeShort(t)}</Pill>
                        ))}
                        {r.recommendation_types.length > 2 && (
                          <Pill className="bg-muted text-muted-foreground border-border">+{r.recommendation_types.length - 2}</Pill>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.best_fit_shift}</td>
                    <td className="py-2 pr-3 text-xs">{actionFromTestStyle(r)}</td>
                    <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                      {fmtMoney(r.modelled_opportunity, currency)}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Pill className={confidenceTone(r.confidence)}>{confidenceLabel(r.confidence)}</Pill>
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      {r.requires_confirmation ? "Confirm availability" : "Fits pattern"}
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDrawer({ kind: "rec", rec: r })}>
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rota opportunity matrix — labels only, click for details */}
      {cols.length > 0 && data.servers.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base font-bold">Rota opportunity matrix</h3>
          <p className="mt-1 text-xs text-muted-foreground">Click any cell for the full reasoning behind the label.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 sticky left-0 bg-white z-10">Server</th>
                  <th className="text-left py-2 pr-3 sticky left-[120px] bg-white text-[10px] uppercase text-muted-foreground z-10">Pattern</th>
                  {cols.map((c) => (
                    <th key={c.key} className="text-center py-2 px-1 min-w-[80px]">
                      {c.outlet && <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">{c.outlet}</div>}
                      <div className="font-semibold">{DAY_NAMES[c.dow]}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">{c.daypart}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.servers.map((s) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-1.5 pr-3 font-semibold sticky left-0 bg-white align-middle">{s.name}</td>
                    <td className="py-1.5 pr-3 sticky left-[120px] bg-white align-middle">
                      <Pill
                        className="bg-muted text-muted-foreground border-border"
                        // native title gives a quick observed-pattern hover
                      >
                        <span title={s.pattern.pattern_label}>{patternShort(s.pattern.pattern)}</span>
                      </Pill>
                    </td>
                    {cols.map((c) => {
                      const cell = cellBy.get(`${s.id}|${c.key}`);
                      if (!cell) {
                        return <td key={c.key} className="text-center py-1 px-1 align-middle"><span className="text-muted-foreground">—</span></td>;
                      }
                      const isClickable = cell.cell_label !== "insufficient_data" && cell.cell_label !== "not_eligible";
                      return (
                        <td key={c.key} className="text-center py-1 px-1 align-middle">
                          <button
                            type="button"
                            disabled={!isClickable}
                            onClick={() => isClickable && setDrawer({
                              kind: "cell",
                              cell,
                              server: s.name,
                              shiftLabel: colLabel(c),
                              pattern: s.pattern.pattern_label,
                            })}
                            className={`block w-full rounded-md border px-1.5 py-1 text-[11px] transition-colors ${cellTone(cell.cell_label)} ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <span className="font-semibold">{cellShort(cell.cell_label)}</span>
                            {cell.modelled_marginal_lift != null && Math.abs(cell.modelled_marginal_lift) >= 20 && (
                              <span className="block text-[9px] font-normal opacity-80 leading-tight">
                                {fmtMoney(cell.modelled_marginal_lift, currency)}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-brand-green/25" /> Best</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-brand-green/10" /> Good</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-brand-orange/15" /> Test</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-100" /> Confirm</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[color:var(--opportunity)]/15" /> Avoid</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-zinc-100" /> Not eligible</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-muted" /> No data</span>
          </div>
        </div>
      )}

      {/* Manager guardrails — compact, collapsible */}
      <details className="mt-6 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Manager guardrails & methodology</summary>
        <div className="mt-2 space-y-1">
          <div>Recommendations are directional and modelled — never automatic rota decisions. Working pattern labels reflect observed rota behaviour, not contractual status.</div>
          <div>Cross-outlet recommendations are disabled by default. A server is only suggested for an outlet where they have history or have been explicitly marked cross-outlet eligible.</div>
          <div><strong>Peak performer</strong> holds throughput and Adj. LLS when pressure is high — use to <em>protect</em> already-busy shifts.</div>
          <div><strong>Slow-shift lifter</strong> creates the biggest <em>marginal</em> value on a weaker shift because the current baseline has more headroom there.</div>
        </div>
      </details>

      {/* Detail drawer */}
      <Sheet open={drawer != null} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {drawer?.kind === "rec" && (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.rec.server_name}</SheetTitle>
                <SheetDescription>{drawer.rec.best_fit_shift}</SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <RecommendationDetail rec={drawer.rec} currency={currency} />
              </div>
            </>
          )}
          {drawer?.kind === "cell" && (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.server}</SheetTitle>
                <SheetDescription>{drawer.shiftLabel}</SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <CellDetail cell={drawer.cell} server={drawer.server} shiftLabel={drawer.shiftLabel} pattern={drawer.pattern} currency={currency} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
