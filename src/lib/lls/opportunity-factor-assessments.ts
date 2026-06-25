/**
 * Phase 20C — OF v2 Preview Persistence.
 *
 * Lightweight, audit-only persistence for Opportunity Factor preview
 * assessments. This NEVER changes:
 *   - committed shift.opportunity_factor values
 *   - Adjusted LLS results
 *   - applied opportunity factor (v1 remains the applied factor)
 *
 * It only stores preview metadata so managers can read back the latest
 * v2 assessment and audit when / why a recommendation was made.
 *
 * Server routes (/server/*) MUST NOT import this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OpportunityFactorPreview,
  OpportunityFactorPreviewBucket,
} from "@/lib/lls/opportunity-factor-v2-preview";

export interface OfAssessmentRow {
  venue_id: string;
  organisation_id?: string | null;
  week_start: string;
  period_start?: string | null;
  period_end?: string | null;
  bucket_type: "overall" | "daypart" | "day_of_week" | "outlet";
  bucket_key: string;
  applied_factor_version: "v1";
  applied_v1_factor: number | null;
  preview_factor_version: "v2_preview";
  preview_v2_factor: number | null;
  delta: number | null;
  confidence: string | null;
  basis: string | null;
  hours_source: string | null;
  decision_grade: string | null;
  can_drive_hard_recommendation: boolean;
  comparison_level: number | null;
  comparable_count: number | null;
  inputs_used: string[];
  inputs_excluded: string[];
  warnings: string[];
  fallback_reason: string | null;
  explanation: string | null;
  generated_at: string;
}

/** Map an overall preview to an OfAssessmentRow for the overall bucket. */
export function buildOverallAssessmentRow(args: {
  venueId: string;
  organisationId?: string | null;
  weekStart: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  preview: OpportunityFactorPreview;
  generatedAt?: string;
}): OfAssessmentRow {
  const p = args.preview;
  return {
    venue_id: args.venueId,
    organisation_id: args.organisationId ?? null,
    week_start: args.weekStart,
    period_start: args.periodStart ?? null,
    period_end: args.periodEnd ?? null,
    bucket_type: "overall",
    bucket_key: "_overall_",
    applied_factor_version: "v1",
    applied_v1_factor: p.opportunity_factor_v1,
    preview_factor_version: "v2_preview",
    preview_v2_factor: p.opportunity_factor_v2,
    delta: p.opportunity_factor_delta,
    confidence: p.confidence,
    basis: p.basis,
    hours_source: p.hours_source,
    decision_grade: p.decision_grade,
    can_drive_hard_recommendation: p.can_drive_hard_recommendation,
    comparison_level: p.comparison_level,
    comparable_count: p.comparable_count,
    inputs_used: p.inputs_used,
    inputs_excluded: p.inputs_excluded,
    warnings: p.warnings,
    fallback_reason: p.fallback_reason,
    explanation: p.explanation,
    generated_at: args.generatedAt ?? new Date().toISOString(),
  };
}

/** Map a bucket preview to an OfAssessmentRow. */
export function buildBucketAssessmentRow(args: {
  venueId: string;
  organisationId?: string | null;
  weekStart: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  bucket: OpportunityFactorPreviewBucket;
  generatedAt?: string;
}): OfAssessmentRow {
  const b = args.bucket;
  return {
    venue_id: args.venueId,
    organisation_id: args.organisationId ?? null,
    week_start: args.weekStart,
    period_start: args.periodStart ?? null,
    period_end: args.periodEnd ?? null,
    bucket_type: b.axis === "daypart" ? "daypart" : "day_of_week",
    bucket_key: b.key,
    applied_factor_version: "v1",
    applied_v1_factor: b.opportunity_factor_v1,
    preview_factor_version: "v2_preview",
    preview_v2_factor: b.opportunity_factor_v2,
    delta: b.opportunity_factor_delta,
    confidence: b.confidence,
    basis: b.basis,
    hours_source: b.hours_source,
    decision_grade: b.decision_grade,
    can_drive_hard_recommendation: b.can_drive_hard_recommendation,
    comparison_level: null,
    comparable_count: b.comparable_count,
    inputs_used: b.inputs_used,
    inputs_excluded: b.inputs_excluded,
    warnings: b.warnings,
    fallback_reason: b.fallback_reason,
    explanation: null,
    generated_at: args.generatedAt ?? new Date().toISOString(),
  };
}

/** Build the full set of assessment rows (overall + per-bucket) for a preview. */
export function buildAssessmentRows(args: {
  venueId: string;
  organisationId?: string | null;
  weekStart: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  preview: OpportunityFactorPreview;
  generatedAt?: string;
}): OfAssessmentRow[] {
  const rows: OfAssessmentRow[] = [
    buildOverallAssessmentRow(args),
  ];
  for (const b of args.preview.buckets.by_daypart) {
    rows.push(buildBucketAssessmentRow({ ...args, bucket: b }));
  }
  for (const b of args.preview.buckets.by_day_of_week) {
    rows.push(buildBucketAssessmentRow({ ...args, bucket: b }));
  }
  return rows;
}

/**
 * Persist the latest preview assessments for (venue, week). Upserts on
 * (venue_id, week_start, bucket_type, bucket_key). Failures are swallowed
 * — preview persistence is best-effort and must never break the LLS page.
 */
export async function persistAssessmentRows(
  supabase: SupabaseClient,
  rows: OfAssessmentRow[],
): Promise<{ persisted: number; error: string | null }> {
  if (!rows.length) return { persisted: 0, error: null };
  try {
    const { error } = await (supabase as any)
      .from("opportunity_factor_assessments")
      .upsert(rows, {
        onConflict: "venue_id,week_start,bucket_type,bucket_key",
      });
    if (error) return { persisted: 0, error: error.message };
    return { persisted: rows.length, error: null };
  } catch (e) {
    return { persisted: 0, error: (e as Error).message };
  }
}

/** Read back the latest overall assessment for a venue+week, if any. */
export async function readLatestOverallAssessment(
  supabase: SupabaseClient,
  venueId: string,
  weekStart: string,
): Promise<OfAssessmentRow | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("opportunity_factor_assessments")
      .select("*")
      .eq("venue_id", venueId)
      .eq("week_start", weekStart)
      .eq("bucket_type", "overall")
      .eq("bucket_key", "_overall_")
      .maybeSingle();
    if (error) return null;
    return (data as OfAssessmentRow) ?? null;
  } catch {
    return null;
  }
}
