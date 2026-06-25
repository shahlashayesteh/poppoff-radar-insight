// Phase 21 — Manager Traceability & Evidence Explorer.
//
// Read-only server functions that surface the provenance, reliability,
// recommendation evidence and OF v2 preview assessment metadata already
// persisted by phases 17–20C, so managers can see WHERE a number came from.
//
// Hard contract:
//   - Server routes (/server/*) MUST NOT import this module. All exports
//     here are manager intelligence.
//   - Every handler runs requirePaidManagerEntitlement + assertVenueAccess
//     so head-office multi-venue accounts cannot leak across venues, and
//     cancelled/expired/past-due-beyond-grace accounts cannot read trace
//     data even if the UI gate is bypassed.
//   - Trace data is READ-ONLY. Nothing here mutates shifts, weekly
//     priorities, menu suggestions, OF assessments or LLS values.
//   - Adjusted LLS remains v1. OF v2 assessment trace is preview-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";
import { assertVenueAccess } from "@/lib/venue-access";

// -------- shared types --------

export interface TraceProvenance {
  source_system: string | null;
  source_file: string | null;
  source_batch_id: string | null;
  source_row_hash: string | null;
  sales_basis: string | null;
  labor_basis: string | null;
  reliability_class: string | null;
  calculation_safety: string | null;
  identity_match_method: string | null;
  identity_match_confidence: number | null;
  warnings: string[];
  imported_at: string | null;
  committed_at: string | null;
}

export interface TraceEvidence {
  based_on: string[];
  estimated_inputs: string[];
  excluded_contextual_fields: string[];
  blocked_fields: string[];
  explanation_basis: string | null;
  recommendation_confidence: string | null;
}

export interface OfV2TraceBucket {
  bucket_type: "overall" | "daypart" | "day_of_week" | "outlet";
  bucket_key: string;
  applied_v1_factor: number | null;
  preview_v2_factor: number | null;
  delta: number | null;
  confidence: string | null;
  basis: string | null;
  hours_source: string | null;
  decision_grade: string | null;
  can_drive_hard_recommendation: boolean;
  comparable_count: number | null;
  inputs_used: string[];
  inputs_excluded: string[];
  warnings: string[];
  fallback_reason: string | null;
  generated_at: string | null;
}

// -------- input schemas --------

const VenueWeek = z.object({
  venueId: z.string().min(1),
  weekStart: z.string().min(1),
});
const VenueBatch = z.object({
  venueId: z.string().min(1),
  batchId: z.string().min(1),
});
const VenueRecord = z.object({
  venueId: z.string().min(1),
  recordType: z.enum(["weekly_priority", "menu_suggestion"]),
  recordId: z.string().min(1),
});
const VenueOnly = z.object({ venueId: z.string().min(1) });

// -------- helpers --------

function safeArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  return [];
}

function extractProvenance(row: any): TraceProvenance {
  const p = row?.provenance ?? {};
  return {
    source_system: row?.source_system ?? p?.source_system ?? null,
    source_file: p?.source_file ?? null,
    source_batch_id: p?.source_batch_id ?? row?.active_batch_id ?? null,
    source_row_hash: p?.source_row_hash ?? null,
    sales_basis: row?.sales_basis ?? p?.sales_basis ?? null,
    labor_basis: row?.labor_basis ?? p?.labor_basis ?? null,
    reliability_class: row?.reliability_class ?? p?.reliability_class ?? null,
    calculation_safety: p?.calculation_safety ?? null,
    identity_match_method:
      row?.match_method ?? p?.identity_match_method ?? null,
    identity_match_confidence: p?.identity_match_confidence ?? null,
    warnings: safeArr(p?.warnings),
    imported_at: row?.imported_at ?? p?.imported_at ?? null,
    committed_at: p?.committed_at ?? row?.created_at ?? null,
  };
}

function extractEvidence(row: any): TraceEvidence {
  const e = row?.evidence ?? {};
  return {
    based_on: safeArr(e?.based_on),
    estimated_inputs: safeArr(e?.estimated_inputs),
    excluded_contextual_fields: safeArr(e?.excluded_contextual_fields),
    blocked_fields: safeArr(e?.blocked_fields),
    explanation_basis: e?.explanation_basis ?? null,
    recommendation_confidence: row?.recommendation_confidence ?? null,
  };
}

// -------- LLS / shifts trace --------

/**
 * Sample provenance from up to `limit` recently-committed shifts for
 * (venueId, weekStart). Surfaces sales/labour basis, reliability class,
 * identity match method and import batch so the LLS page can show the
 * evidence behind the weekly scorecard without dumping every row.
 */
export const getLlsTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueWeek>) => VenueWeek.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const weekStart = data.weekStart;
    const end = new Date(weekStart + "T00:00:00");
    end.setUTCDate(end.getUTCDate() + 7);
    const weekEnd = end.toISOString().slice(0, 10);

    const { data: rows } = await (context.supabase as any)
      .from("shifts_v2")
      .select(
        "id, service_date, dominant_daypart, sales_basis, labor_basis, reliability_class, source_system, provenance, match_method, imported_at, active_batch_id, created_at",
      )
      .eq("venue_id", data.venueId)
      .gte("service_date", weekStart)
      .lt("service_date", weekEnd)
      .eq("is_active", true)
      .order("service_date", { ascending: true })
      .limit(50);

    const samples = ((rows ?? []) as any[]).map((r) => ({
      shift_id: r.id,
      service_date: r.service_date,
      daypart: r.dominant_daypart,
      ...extractProvenance(r),
    }));

    // Aggregate counts so the panel can show "X measured, Y derived, Z estimated".
    const tally: Record<string, number> = {};
    for (const s of samples) {
      const k = s.reliability_class ?? "unknown";
      tally[k] = (tally[k] ?? 0) + 1;
    }

    return {
      venueId: data.venueId,
      weekStart,
      sampleCount: samples.length,
      reliabilityTally: tally,
      samples,
    };
  });

// -------- Reports trace --------

/**
 * For /manager/reports — returns the latest sales/labour basis mix across
 * the most recent committed shifts for the venue so the reports page can
 * label trends with measured/derived evidence.
 */
export const getReportsTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueOnly>) => VenueOnly.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const { data: rows } = await (context.supabase as any)
      .from("shifts_v2")
      .select("sales_basis, labor_basis, reliability_class, source_system")
      .eq("venue_id", data.venueId)
      .eq("is_active", true)
      .order("service_date", { ascending: false })
      .limit(500);

    const tally = {
      sales_basis: {} as Record<string, number>,
      labor_basis: {} as Record<string, number>,
      reliability_class: {} as Record<string, number>,
      source_system: {} as Record<string, number>,
    };
    for (const r of (rows ?? []) as any[]) {
      const sb = r.sales_basis ?? "unknown";
      const lb = r.labor_basis ?? "unknown";
      const rc = r.reliability_class ?? "unknown";
      const src = r.source_system ?? "unknown";
      tally.sales_basis[sb] = (tally.sales_basis[sb] ?? 0) + 1;
      tally.labor_basis[lb] = (tally.labor_basis[lb] ?? 0) + 1;
      tally.reliability_class[rc] = (tally.reliability_class[rc] ?? 0) + 1;
      tally.source_system[src] = (tally.source_system[src] ?? 0) + 1;
    }
    return { venueId: data.venueId, sampled: (rows ?? []).length, tally };
  });

// -------- Imports trace --------

/**
 * For /manager/imports/$batchId — returns the batch-level provenance plus
 * a short list of staging row hashes so the trace panel can show "this is
 * what we ingested".
 */
export const getImportTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueBatch>) => VenueBatch.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const { data: batch } = await (context.supabase as any)
      .from("shift_import_batches_v2")
      .select(
        "id, source_kind, source_filename, source_system, import_type, file_hash, row_count, accepted_count, rejected_count, warning_count, sales_basis_summary, labour_basis_summary, validation_summary, status, approved_at, committed_at, created_at",
      )
      .eq("id", data.batchId)
      .eq("venue_id", data.venueId)
      .maybeSingle();

    if (!batch) {
      return { found: false as const, batch: null, sampleRows: [] };
    }

    const { data: sample } = await (context.supabase as any)
      .from("shift_staging_rows")
      .select("row_index, row_hash, validation_status, warnings")
      .eq("batch_id", data.batchId)
      .order("row_index", { ascending: true })
      .limit(20);

    return {
      found: true as const,
      batch,
      sampleRows: (sample ?? []) as any[],
    };
  });

// -------- Recommendation trace (priorities / menu / coaching) --------

/**
 * For /manager/priorities, /manager/menu, /manager/coaching — returns the
 * evidence JSON the recommendation was generated against, plus the
 * recommendation_confidence label and excluded contextual fields.
 *
 * Coaching reads from weekly_priorities (the canonical recommendation
 * source); the coaching page passes recordType="weekly_priority".
 */
export const getRecommendationTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueRecord>) => VenueRecord.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const table =
      data.recordType === "menu_suggestion"
        ? "menu_item_suggestions"
        : "weekly_priorities";

    const { data: row } = await (context.supabase as any)
      .from(table)
      .select("id, venue_id, evidence, recommendation_confidence, created_at, updated_at")
      .eq("id", data.recordId)
      .eq("venue_id", data.venueId)
      .maybeSingle();

    if (!row) {
      return { found: false as const, recordType: data.recordType, evidence: null };
    }
    return {
      found: true as const,
      recordType: data.recordType,
      recordId: row.id,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
      evidence: extractEvidence(row),
    };
  });

// -------- OF v2 assessment trace --------

/**
 * Read-only view over opportunity_factor_assessments. Returns the overall
 * preview row plus per-daypart / per-day-of-week buckets for the requested
 * (venueId, weekStart).
 *
 * The shape makes "Applied v1 factor vs Preview v2 factor" explicit so the
 * trace panel can render "Preview only. Applied LLS still uses v1."
 */
export const getOfV2AssessmentTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueWeek>) => VenueWeek.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const { data: rows } = await (context.supabase as any)
      .from("opportunity_factor_assessments")
      .select("*")
      .eq("venue_id", data.venueId)
      .eq("week_start", data.weekStart)
      .order("bucket_type", { ascending: true })
      .order("bucket_key", { ascending: true });

    const list = (rows ?? []) as any[];
    const toBucket = (r: any): OfV2TraceBucket => ({
      bucket_type: r.bucket_type,
      bucket_key: r.bucket_key,
      applied_v1_factor: r.applied_v1_factor != null ? Number(r.applied_v1_factor) : null,
      preview_v2_factor: r.preview_v2_factor != null ? Number(r.preview_v2_factor) : null,
      delta: r.delta != null ? Number(r.delta) : null,
      confidence: r.confidence,
      basis: r.basis,
      hours_source: r.hours_source,
      decision_grade: r.decision_grade,
      can_drive_hard_recommendation: !!r.can_drive_hard_recommendation,
      comparable_count: r.comparable_count ?? null,
      inputs_used: safeArr(r.inputs_used),
      inputs_excluded: safeArr(r.inputs_excluded),
      warnings: safeArr(r.warnings),
      fallback_reason: r.fallback_reason ?? null,
      generated_at: r.generated_at ?? null,
    });

    const overall = list.find((r) => r.bucket_type === "overall") ?? null;
    return {
      venueId: data.venueId,
      weekStart: data.weekStart,
      previewOnly: true as const,
      appliedFactorVersion: "v1" as const,
      overall: overall ? toBucket(overall) : null,
      byDaypart: list.filter((r) => r.bucket_type === "daypart").map(toBucket),
      byDayOfWeek: list.filter((r) => r.bucket_type === "day_of_week").map(toBucket),
      bucketCount: list.length,
    };
  });
