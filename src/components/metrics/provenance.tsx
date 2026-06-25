/**
 * Shared metric provenance components.
 *
 * These render the basis / provenance / formula already returned by
 * src/lib/metrics/. Use everywhere a manager-facing metric appears so a
 * GM / F&B Manager / Operations Director / CFO can hover and understand:
 *   - what the metric means
 *   - the formula used
 *   - source fields used
 *   - sales / labour / benchmark basis
 *   - whether the value is uploaded / derived / estimated / modelled / defaulted
 *   - data-quality limitations
 *
 * IMPORTANT: Do NOT import these into /server/* routes. The server dashboard
 * stays simple and gamified; use plain `est.` / `modelled` text labels there.
 */
import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info, Database, AlertTriangle, Sparkles } from "lucide-react";
import type {
  MetricResult,
  Provenance,
  LaborBasis,
  SalesBasis,
} from "@/lib/metrics/types";

/* ----------------------------------------------------------------- *
 * Labels — keep wording consistent everywhere a metric is displayed *
 * ----------------------------------------------------------------- */

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  uploaded: "Uploaded",
  derived: "Derived",
  estimated: "Estimated",
  defaulted: "Defaulted",
};

export const PROVENANCE_DESCRIPTION: Record<Provenance, string> = {
  uploaded: "Taken directly from an uploaded source field.",
  derived: "Computed from uploaded fields using a documented formula.",
  estimated: "Approximated where a source field was missing.",
  defaulted: "Fell back to a safe default — no source data available.",
};

export const LABOR_BASIS_LABEL: Record<LaborBasis, string> = {
  fully_loaded: "Fully loaded labour",
  total: "Total labour",
  wage_plus_oncost: "Wage + employer on-cost",
  wage_only: "Wage only",
  rate_times_hours: "Hours × rate (estimate)",
  mixed: "Mixed labour basis",
  unknown: "Unknown labour basis",
  none: "No labour cost basis",
};

export const SALES_BASIS_LABEL: Record<import("@/lib/metrics/types").SalesBasis, string> = {
  net_sales_source: "Net sales",
  net_sales_derived: "Net (derived from gross − leakage)",
  gross_sales_source: "Gross sales",
  gross_used_as_net_estimate: "Gross used as net estimate",
  mixed: "Mixed sales basis",
  unknown: "Unknown basis",
};

const PROVENANCE_TONE: Record<Provenance, string> = {
  uploaded: "bg-brand-green/10 text-brand-green border-brand-green/30",
  derived: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  estimated:
    "bg-brand-orange/10 text-brand-orange border-brand-orange/30",
  defaulted:
    "bg-[color:var(--opportunity)]/10 text-[color:var(--opportunity)] border-[color:var(--opportunity)]/30",
};

/* ----------------------- *
 * MetricBasisBadge        *
 * ----------------------- */

export interface MetricBasisBadgeProps {
  provenance: Provenance;
  /** Optional short label to display alongside provenance, e.g. "Fully loaded". */
  basisLabel?: string;
  className?: string;
}

export function MetricBasisBadge({
  provenance,
  basisLabel,
  className,
}: MetricBasisBadgeProps) {
  return (
    <span
      data-testid="metric-basis-badge"
      data-provenance={provenance}
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROVENANCE_TONE[provenance]} ${className ?? ""}`}
    >
      <span>{PROVENANCE_LABEL[provenance]}</span>
      {basisLabel ? (
        <>
          <span className="opacity-50">·</span>
          <span className="normal-case font-medium">{basisLabel}</span>
        </>
      ) : null}
    </span>
  );
}

/* ----------------------- *
 * LaborBasisBadge         *
 * ----------------------- */

export function LaborBasisBadge({
  basis,
  className,
}: {
  basis: LaborBasis | null | undefined;
  className?: string;
}) {
  if (!basis || basis === "none") return null;
  const label = LABOR_BASIS_LABEL[basis];
  const isFull = basis === "fully_loaded" || basis === "total";
  const tone = isFull
    ? "bg-brand-green/10 text-brand-green border-brand-green/30"
    : "bg-brand-orange/10 text-brand-orange border-brand-orange/30";
  return (
    <span
      data-testid="labor-basis-badge"
      data-basis={basis}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone} ${className ?? ""}`}
      title="Labour cost basis used in this calculation. Wage-only is never relabelled as fully-loaded labour cost."
    >
      <span className="uppercase tracking-wide text-[9px] opacity-70">
        Labour basis
      </span>
      <span>{label}</span>
    </span>
  );
}

/* ----------------------- *
 * SalesBasisBadge         *
 * ----------------------- */

export function SalesBasisBadge({
  basis,
  className,
}: {
  basis: SalesBasis | null | undefined;
  className?: string;
}) {
  if (!basis || basis === "unknown") return null;
  const label = SALES_BASIS_LABEL[basis];
  const isClean = basis === "net_sales_source" || basis === "net_sales_derived";
  const isEstimate = basis === "gross_used_as_net_estimate" || basis === "mixed";
  const tone = isClean
    ? "bg-brand-green/10 text-brand-green border-brand-green/30"
    : isEstimate
    ? "bg-brand-orange/10 text-brand-orange border-brand-orange/30"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span
      data-testid="sales-basis-badge"
      data-basis={basis}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone} ${className ?? ""}`}
      title="Sales basis used in this calculation. Gross is never silently relabelled as net."
    >
      <span className="uppercase tracking-wide text-[9px] opacity-70">
        Sales basis
      </span>
      <span>{label}</span>
    </span>
  );
}

/* ----------------------- *
 * GrossEstimateWarning    *
 * ----------------------- */

export function GrossEstimateWarning({ className }: { className?: string }) {
  return (
    <div
      data-testid="gross-estimate-warning"
      role="status"
      className={`flex items-start gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-[12px] text-brand-orange ${className ?? ""}`}
    >
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        <strong className="font-semibold">Gross used as net estimate.</strong>{" "}
        No discounts, comps, voids or refunds uploaded for this period — figures
        are directional only. Upload leakage fields for a defensible net basis.
      </span>
    </div>
  );
}

/* ----------------------- *
 * MixedBasisWarning       *
 * ----------------------- */

export function MixedBasisWarning({
  kind,
  className,
}: {
  kind: "labour" | "sales";
  className?: string;
}) {
  const label =
    kind === "labour"
      ? "Mixed labour basis across selected rows."
      : "Mixed sales basis across selected rows.";
  const detail =
    kind === "labour"
      ? "Some rows use fully loaded labour, others wage-only or hours×rate. Aggregating across mixed bases will distort labour %."
      : "Some rows use net sales, others gross. Aggregating across mixed bases will distort revenue figures.";
  return (
    <div
      data-testid="mixed-basis-warning"
      data-kind={kind}
      role="alert"
      className={`flex items-start gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-[12px] text-brand-orange ${className ?? ""}`}
    >
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        <strong className="font-semibold">{label}</strong> {detail}
      </span>
    </div>
  );
}

/* ----------------------- *
 * DataQualityChip         *
 * ----------------------- */

export type DataQualityKind =
  | "unmatched-pos"
  | "unmatched-labour"
  | "ambiguous-match"
  | "missing-field"
  | "derived-field"
  | "estimated-value"
  | "defaulted-of"
  | "low-sample"
  | "mixed-basis";

const DQ_LABEL: Record<DataQualityKind, string> = {
  "unmatched-pos": "Unmatched POS rows",
  "unmatched-labour": "Unmatched labour rows",
  "ambiguous-match": "Ambiguous matches",
  "missing-field": "Missing field",
  "derived-field": "Derived field",
  "estimated-value": "Estimated value",
  "defaulted-of": "Opportunity factor defaulted to 1.0",
  "low-sample": "Low sample size",
  "mixed-basis": "Mixed labour basis",
};

export function DataQualityChip({
  kind,
  count,
  className,
}: {
  kind: DataQualityKind;
  count?: number;
  className?: string;
}) {
  return (
    <span
      data-testid="data-quality-chip"
      data-kind={kind}
      className={`inline-flex items-center gap-1 rounded-md border border-brand-orange/30 bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-orange ${className ?? ""}`}
    >
      <AlertTriangle className="h-3 w-3" />
      <span>{DQ_LABEL[kind]}</span>
      {typeof count === "number" ? <span className="opacity-70">({count})</span> : null}
    </span>
  );
}

/* ----------------------- *
 * ModelledValueLabel      *
 * ----------------------- */

/**
 * Renders a small "modelled" / "directional" / "est." chip next to any value
 * that is NOT realised revenue or actuals. Use for expected sales, recoverable
 * opportunity, modelled uplift, revenue influence, attach-rate projections,
 * leakage estimates.
 */
export function ModelledValueLabel({
  kind = "modelled",
  className,
}: {
  kind?: "modelled" | "directional" | "est";
  className?: string;
}) {
  const label =
    kind === "est" ? "est." : kind === "directional" ? "directional" : "modelled";
  return (
    <span
      data-testid="modelled-value-label"
      data-kind={kind}
      className={`inline-flex items-center gap-1 rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
      title="This figure is a directional model — not realised revenue or guaranteed uplift."
    >
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

/* ----------------------- *
 * SourceFieldPopover      *
 * ----------------------- */

export function SourceFieldPopover({
  sourceFields,
  className,
}: {
  sourceFields: string[];
  className?: string;
}) {
  if (!sourceFields.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="source-field-popover-trigger"
          className={`inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground ${className ?? ""}`}
        >
          <Database className="h-3 w-3" /> {sourceFields.length} source field{sourceFields.length === 1 ? "" : "s"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs" align="start">
        <div className="font-semibold mb-2">Source fields</div>
        <ul className="space-y-1">
          {sourceFields.map((f) => (
            <li key={f} className="font-mono text-[11px] text-muted-foreground">
              {f}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------- *
 * MetricTooltip           *
 * ----------------------- */

export interface MetricTooltipProps {
  /** Metric name shown as the tooltip title, e.g. "Adjusted LLS". */
  name: string;
  /** One-line plain-English explanation. */
  description?: string;
  /** Engine MetricResult — supplies formula, basis, provenance, source fields. */
  metric?: MetricResult<any> | null;
  /** Override fields when no MetricResult is available (legacy call sites). */
  formula?: string;
  sourceFields?: string[];
  basisLabel?: string;
  provenance?: Provenance;
  /** Benchmark disclosure: period + scope + basis. */
  benchmark?: {
    period?: string;
    scope?: string;
    basis?: string;
    weighted?: boolean;
  };
  /** Free-text notes to show under the formula (data-quality caveats). */
  notes?: string[];
  /** Child becomes the trigger; if absent we render a small info icon. */
  children?: React.ReactNode;
}

export function MetricTooltip({
  name,
  description,
  metric,
  formula,
  sourceFields,
  basisLabel,
  provenance,
  benchmark,
  notes,
  children,
}: MetricTooltipProps) {
  const f = formula ?? metric?.formula;
  const fields = sourceFields ?? metric?.sourceFields ?? [];
  const prov = provenance ?? metric?.provenance;
  const basis = basisLabel ?? (metric?.basis ? String(metric.basis) : undefined);
  const allNotes = [...(notes ?? []), ...(metric?.notes ?? [])];

  const trigger = children ?? (
    <span className="inline-flex items-center text-muted-foreground hover:text-foreground">
      <Info className="h-3 w-3" />
    </span>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="metric-tooltip-trigger"
            data-metric={name}
            className="inline-flex items-center gap-1 cursor-help"
          >
            {trigger}
          </span>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-sm whitespace-normal bg-popover text-popover-foreground border border-border p-3 text-xs"
          side="top"
        >
          <div className="font-display font-bold text-sm mb-1">{name}</div>
          {description ? (
            <p className="text-muted-foreground mb-2">{description}</p>
          ) : null}
          {f ? (
            <div className="mb-2">
              <div className="uppercase tracking-wide text-[9px] text-muted-foreground">
                Formula
              </div>
              <code className="block font-mono text-[11px] bg-muted/60 rounded px-1.5 py-1 mt-0.5 break-words">
                {f}
              </code>
            </div>
          ) : null}
          {basis ? (
            <div className="mb-1.5">
              <span className="uppercase tracking-wide text-[9px] text-muted-foreground mr-1">
                Basis
              </span>
              <span className="font-medium">{basis}</span>
            </div>
          ) : null}
          {prov ? (
            <div className="mb-1.5 flex items-center gap-1.5">
              <MetricBasisBadge provenance={prov} />
              <span className="text-muted-foreground">
                {PROVENANCE_DESCRIPTION[prov]}
              </span>
            </div>
          ) : null}
          {benchmark ? (
            <div className="mb-1.5">
              <div className="uppercase tracking-wide text-[9px] text-muted-foreground">
                Benchmark
              </div>
              <div className="text-[11px] leading-relaxed">
                {[
                  benchmark.period,
                  benchmark.scope,
                  benchmark.basis,
                  benchmark.weighted ? "weighted" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ) : null}
          {fields.length ? (
            <div className="mb-1">
              <div className="uppercase tracking-wide text-[9px] text-muted-foreground">
                Source fields
              </div>
              <div className="font-mono text-[10px] text-muted-foreground break-words">
                {fields.join(", ")}
              </div>
            </div>
          ) : null}
          {allNotes.length ? (
            <ul className="mt-1.5 list-disc pl-4 text-[11px] text-brand-orange">
              {allNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
