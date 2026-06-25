// Phase 18 — Row-level provenance & evidence persistence helpers.
//
// Builds the small, well-typed JSON payloads stored in:
//   - shifts.provenance / shifts_v2.provenance
//   - weekly_priorities.evidence
//   - menu_item_suggestions.evidence
//   - server_coaching.evidence
//
// Server pages MUST NOT import this module — provenance/evidence are
// manager-side intelligence (Phase 10 contract).

import type { ReliabilityClass } from "@/lib/data-reliability";

export type SalesBasis = "net" | "gross" | "gross_as_net_estimated" | "unknown";
export type LaborBasis = "wages_only" | "wages_plus_oncosts" | "unknown_estimated";
export type RecommendationConfidence = "high" | "medium" | "low" | "blocked";

export interface ShiftProvenance {
  source_system?: string | null;
  source_file?: string | null;
  source_batch_id?: string | null;
  source_row_id?: string | null;
  source_row_hash?: string | null;
  sales_basis?: SalesBasis | null;
  labor_basis?: LaborBasis | null;
  reliability_class?: ReliabilityClass | null;
  calculation_safety?: "safe_for_scoring" | "warning" | "blocked" | null;
  identity_match_method?: string | null;
  identity_match_confidence?: number | null;
  venue_id?: string | null;
  organisation_id?: string | null;
  imported_at?: string | null;
  committed_at?: string | null;
  field_mapping?: Record<string, string> | null;
  warnings?: string[];
}

export interface RecommendationEvidence {
  based_on: string[];
  estimated_inputs?: string[];
  excluded_contextual_fields?: string[];
  blocked_fields?: string[];
  source_metrics?: Record<string, number | string | null>;
  explanation_basis?: string | null;
}

/**
 * Build a shift provenance JSON blob. Empty/undefined keys are dropped so we
 * keep persisted rows small and idempotent.
 */
export function buildShiftProvenance(input: ShiftProvenance): ShiftProvenance {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out as ShiftProvenance;
}

/**
 * Map (sales_basis, labor_basis, identity_match_confidence) to the headline
 * reliability_class persisted on the row. Mirrors src/lib/data-reliability.ts
 * rules so UI and DB agree.
 */
export function deriveReliabilityClass(args: {
  sales_basis?: SalesBasis | null;
  labor_basis?: LaborBasis | null;
  identity_match_confidence?: number | null;
  ambiguous_identity?: boolean;
}): ReliabilityClass {
  if (args.ambiguous_identity) return "untrusted";
  const salesEstimated = args.sales_basis === "gross_as_net_estimated" || args.sales_basis === "unknown";
  const laborEstimated = args.labor_basis === "unknown_estimated";
  if (salesEstimated || laborEstimated) return "estimated";
  if (args.identity_match_confidence != null && args.identity_match_confidence < 0.5) {
    return "estimated";
  }
  // Has both bases known and identity matched — values come straight from POS / clock data.
  if (args.sales_basis && args.labor_basis) return "measured";
  return "derived";
}

export function calculationSafety(cls: ReliabilityClass): ShiftProvenance["calculation_safety"] {
  switch (cls) {
    case "measured":
    case "derived":
      return "safe_for_scoring";
    case "estimated":
      return "warning";
    case "contextual":
    case "untrusted":
      return "blocked";
  }
}

/**
 * Build a recommendation evidence payload for weekly_priorities /
 * menu_item_suggestions / server_coaching. Contextual or blocked fields are
 * never silently promoted into based_on.
 */
export function buildRecommendationEvidence(input: RecommendationEvidence): RecommendationEvidence {
  const dedup = (xs?: string[]) => (xs ? Array.from(new Set(xs.filter(Boolean))) : []);
  const based = dedup(input.based_on);
  const excluded = dedup(input.excluded_contextual_fields);
  const blocked = dedup(input.blocked_fields);
  const cross = based.filter((f) => excluded.includes(f) || blocked.includes(f));
  if (cross.length > 0) {
    throw new Error(
      `provenance: based_on cannot include contextual/blocked fields: ${cross.join(", ")}`,
    );
  }
  const out: RecommendationEvidence = { based_on: based };
  const estimated = dedup(input.estimated_inputs);
  if (estimated.length) out.estimated_inputs = estimated;
  if (excluded.length) out.excluded_contextual_fields = excluded;
  if (blocked.length) out.blocked_fields = blocked;
  if (input.source_metrics && Object.keys(input.source_metrics).length) {
    out.source_metrics = input.source_metrics;
  }
  if (input.explanation_basis) out.explanation_basis = input.explanation_basis;
  return out;
}

/**
 * Confidence label for a recommendation, based on the evidence shape.
 *  - blocked: any blocked_fields, or no based_on, or based_on entirely estimated
 *  - high:    >=2 based_on, no estimated inputs
 *  - medium:  >=1 based_on, some estimated inputs allowed
 *  - low:     only 1 based_on AND has estimated_inputs
 */
export function recommendationConfidence(ev: RecommendationEvidence): RecommendationConfidence {
  if (ev.blocked_fields && ev.blocked_fields.length > 0) return "blocked";
  if (!ev.based_on || ev.based_on.length === 0) return "blocked";
  const estimated = ev.estimated_inputs?.length ?? 0;
  if (estimated >= ev.based_on.length) return "low";
  if (ev.based_on.length >= 2 && estimated === 0) return "high";
  if (ev.based_on.length === 1 && estimated > 0) return "low";
  return "medium";
}
