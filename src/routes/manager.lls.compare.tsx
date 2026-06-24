import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMondayOfWeek, toISODate, formatWeekRange, previousMonday } from "@/lib/week";
import { getLlsComparison, type ComparisonPayload } from "@/lib/lls/v2/comparison.functions";
import { ChevronLeft, ChevronRight, ArrowLeft, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/manager/lls/compare")({ component: ComparePage });

const VARIANCE_LABEL: Record<string, string> = {
  historical_benchmark_replaced_same_week_benchmark: "Same-week comparable benchmark",
  missing_time_preserved: "Missing time preserved (not inferred)",
  duplicate_removed_from_canonical: "Duplicates removed from canonical",
  identity_records_merged: "Identity records merged",
  weighted_opportunity_factor: "Opportunity Factor weighted",
  weighted_weekly_aggregation: "Weighted weekly aggregation",
  missing_covers_not_coerced: "Missing covers not coerced to zero",
  single_sided_record_excluded: "Single-sided records excluded",
  attribution_quality_adjustment: "Attribution-quality adjusted",
  confidence_suppressed_rag: "Low confidence — RAG suppressed",
};

function fmtPct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = x * 100;
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}
function fmtLls(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
}
function fmtMoney(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(x);
}

function bandColour(b: string): string {
  return b === "high" ? "var(--brand-green)"
    : b === "medium" ? "#0ea5e9"
    : b === "low" ? "var(--brand-orange)"
    : "var(--muted-foreground)";
}
function ragColour(r: string | null): string {
  return r === "green" ? "var(--brand-green)"
    : r === "amber" ? "var(--brand-orange)"
    : r === "red" ? "var(--opportunity)"
    : "var(--muted-foreground)";
}

function ComparePage() {
  const [weekStart, setWeekStart] = useState<string>(toISODate(getMondayOfWeek()));
  const fetchComparison = useServerFn(getLlsComparison);

  const { data, error, isLoading, refetch } = useQuery<ComparisonPayload>({
    queryKey: ["lls-comparison", weekStart],
    queryFn: () => fetchComparison({ data: { weekStart } }),
    retry: false,
  });

  const shiftWeek = (dir: -1 | 1) => {
    const cur = new Date(weekStart + "T00:00:00");
    const next = dir === -1 ? previousMonday(cur) : new Date(cur.getTime() + 7 * 86400_000);
    setWeekStart(toISODate(getMondayOfWeek(next)));
  };

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Internal pilot · shadow mode</div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight mt-1">v1 vs v2 comparison</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Side-by-side weekly view. v1 remains the production model — v2 is read-only here.
            </p>
          </div>
          <Link to="/manager/lls" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to LLS
          </Link>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4">
          <Button variant="outline" size="icon" onClick={() => shiftWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-semibold">{formatWeekRange(weekStart)}</div>
          <Button variant="outline" size="icon" onClick={() => shiftWeek(1)}><ChevronRight className="h-4 w-4" /></Button>
          <div className="ml-auto text-xs text-muted-foreground">
            Week starting {weekStart}
          </div>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Loading comparison…</div>}

        {error && (
          <div className="rounded-2xl border border-border bg-amber-50 p-6">
            <div className="flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <div className="font-semibold">Comparison unavailable</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {String((error as Error).message)}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  This view is gated on the venue's <code>lls_compare_mode</code> flag.
                  An authorised internal pilot venue must have it enabled.
                </div>
                <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-3">Retry</Button>
              </div>
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="rounded-2xl border border-border bg-amber-50/60 p-3 text-xs text-foreground/80">
              <strong>Benchmark window:</strong> both v1 and v2 use the prior <strong>{data.baselineWeeks} weeks</strong> of venue history for an apples-to-apples comparison.
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <ModelCard title="v1 (production)" version={data.venue.active_model_version} accent="var(--muted-foreground)">
                <Row label="Adjusted LLS" value={fmtLls(data.comparison.v1.adjusted_lls)} />
                <Row label="Base LLS" value={fmtLls(data.comparison.v1.base_lls)} />
                <Row label="Weekly RPC" value={fmtLls(data.comparison.v1.weekly_rpc)} />
                <Row label={`Benchmark Adj LLS (prior ${data.baselineWeeks}w)`} value={fmtLls(data.comparison.v1.benchmark_adjusted_lls)} />
                <Row label="Performance gap" value={fmtPct(data.comparison.v1.performance_gap)} />
                <Row label="RAG" value={<span style={{ color: ragColour(data.comparison.v1.rag) }} className="font-semibold uppercase text-xs">{data.comparison.v1.rag ?? "—"}</span>} />
                <Row label="Shifts" value={String(data.v1_totals.shifts)} />
              </ModelCard>

              <ModelCard title="v2 (shadow)" version="lls-v2.0.0" accent="#0ea5e9">
                <Row label="Adjusted LLS" value={fmtLls(data.comparison.v2.adjusted_lls)} />
                <Row label="Base LLS" value={fmtLls(data.comparison.v2.base_lls)} />
                <Row label="Weekly RPC" value={fmtLls(data.comparison.v2.weekly_rpc)} />
                <Row label={`Comparable Adj LLS (prior ${data.baselineWeeks}w)`} value={fmtLls(data.comparison.v2.comparable_adjusted_lls)} />
                <Row label="Performance gap" value={fmtPct(data.comparison.v2.performance_gap)} />
                <Row label="RAG" value={<span style={{ color: ragColour(data.comparison.v2.rag) }} className="font-semibold uppercase text-xs">{data.comparison.v2.rag}</span>} />
                <Row label="Expected sales (modelled)" value={fmtMoney(data.comparison.v2.expected_sales)} />
                <Row label="Modelled revenue opportunity" value={fmtMoney(data.comparison.v2.modelled_revenue_opportunity)} />
                <Row label="Shifts" value={`${data.v2_totals.shifts} (${data.v2_totals.needs_review} review · ${data.v2_totals.single_sided} single-sided · ${data.v2_totals.cross_daypart} cross-daypart)`} />
              </ModelCard>
            </div>


            <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
              <h2 className="font-display text-lg font-bold">Difference</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Row label="Δ Adjusted LLS (v2 − v1)" value={data.comparison.diff_adjusted_lls == null ? "—" : data.comparison.diff_adjusted_lls.toFixed(2)} />
                <Row label="Δ Performance gap (v2 − v1)" value={fmtPct(data.comparison.diff_performance_gap)} />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
              <h2 className="font-display text-lg font-bold">v2 confidence</h2>
              <div className="flex flex-wrap gap-2">
                <ConfidenceBadge label="Benchmark" band={data.comparison.v2.benchmark_confidence} />
                <ConfidenceBadge label="Result" band={data.comparison.v2.result_confidence} />
                <ConfidenceBadge label="Final" band={data.comparison.v2.final_confidence} />
              </div>
              {(data.comparison.v2.final_confidence === "low" || data.comparison.v2.final_confidence === "insufficient") && (
                <p className="text-xs text-muted-foreground">
                  Final confidence is below medium — v2 RAG is presented as directional only.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
              <h2 className="font-display text-lg font-bold">Variance explanations</h2>
              <p className="text-xs text-muted-foreground">
                Methodological reasons v2 differs from v1 for this week.
              </p>
              <div className="flex flex-wrap gap-2">
                {data.comparison.variance_explanations.map((code) => (
                  <Badge key={code} variant="secondary" className="text-xs">
                    {VARIANCE_LABEL[code] ?? code}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Active model: <strong>{data.venue.active_model_version}</strong>. v2 is shadow-only;
              no v1 calculation, UI, or data has been modified.
            </div>
          </>
        )}
      </div>
    </ManagerLayout>
  );
}

function ModelCard({
  title, version, accent, children,
}: { title: string; version: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{version}</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ConfidenceBadge({ label, band }: { label: string; band: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: "color-mix(in srgb, " + bandColour(band) + " 12%, white)", color: bandColour(band) }}
    >
      <span className="opacity-60 uppercase tracking-wider">{label}</span>
      <span className="uppercase">{band}</span>
    </span>
  );
}
