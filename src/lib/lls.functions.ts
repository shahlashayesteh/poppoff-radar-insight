import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Phase 12A — paid-feature entitlement guard applied to manager LLS handlers.
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";

// ---------- shared helpers ----------

const DAYPARTS = ["breakfast", "brunch", "lunch", "dinner", "late"] as const;
export type Daypart = (typeof DAYPARTS)[number];

// Phase 16: organisation-aware, membership-validated venue resolver.
// Single-venue callers omit `requestedVenueId` and the helper returns their
// only accessible venue. Multi-venue/head-office callers MUST pass an active
// venue id — silently picking the earliest venue is no longer allowed.
import { resolveManagerVenueId } from "@/lib/venue-access";
async function getManagerVenueId(
  supabase: any,
  userId: string,
  requestedVenueId?: string | null,
): Promise<string> {
  return resolveManagerVenueId(supabase, userId, requestedVenueId);
}


function dayOfWeekISO(dateStr: string): number {
  // Returns 0 = Monday … 6 = Sunday (ISO)
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay(); // 0 sun .. 6 sat
  return js === 0 ? 6 : js - 1;
}

function dayPartFromTime(time: string | null | undefined): Daypart {
  if (!time) return "dinner";
  const h = parseInt(time.slice(0, 2), 10);
  if (Number.isNaN(h)) return "dinner";
  if (h < 10) return "breakfast";
  if (h < 12) return "brunch";
  if (h < 16) return "lunch";
  if (h < 22) return "dinner";
  return "late";
}

// Map common uploaded daypart spellings to the canonical set.
// Returns null when the value is missing/blank/unrecognized so callers can
// fall back to time-based inference.
function normalizeDaypart(raw: unknown): Daypart | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s === "breakfast") return "breakfast";
  if (s === "brunch") return "brunch";
  if (s === "lunch") return "lunch";
  if (s === "dinner" || s === "evening") return "dinner";
  if (s === "late" || s === "latenight") return "late";
  return null;
}


function hashServerId(name: string): string {
  // Deterministic synthetic id from name (no crypto needed)
  const n = name.trim().toLowerCase().replace(/\s+/g, "_");
  return `name:${n}`;
}

// ---------- column mapping CRUD ----------

// Phase 16A — all paid-manager LLS server functions now accept an optional
// `venueId`. Single-venue callers may omit it; multi-venue / head-office
// callers MUST pass it. The resolver throws `active_venue_required` when a
// multi-venue caller forgets, so the UI prompts for a selection instead of
// silently landing on the wrong venue.
const OptionalVenue = { venueId: z.string().uuid().optional() } as const;

export const getColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceType: "sales" | "labor"; venueId?: string }) =>
    z.object({ sourceType: z.enum(["sales", "labor"]), ...OptionalVenue }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: row } = await supabase
      .from("venue_column_mappings")
      .select("mapping")
      .eq("venue_id", venueId)
      .eq("source_type", data.sourceType)
      .maybeSingle();
    return { mapping: (row?.mapping ?? {}) as Record<string, string> };
  });

export const saveColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceType: "sales" | "labor"; mapping: Record<string, string>; venueId?: string }) =>
    z.object({
      sourceType: z.enum(["sales", "labor"]),
      mapping: z.record(z.string(), z.string()),
      ...OptionalVenue,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { error } = await supabase
      .from("venue_column_mappings")
      .upsert(
        { venue_id: venueId, source_type: data.sourceType, mapping: data.mapping, updated_at: new Date().toISOString() },
        { onConflict: "venue_id,source_type" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- opportunity factors ----------

export const getOpportunityFactors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: rows, error } = await supabase
      .from("venue_opportunity_factors")
      .select("day_of_week, daypart, factor")
      .eq("venue_id", venueId);
    if (error) throw new Error(error.message);

    // Build full 7×5 grid with defaults
    const grid: Record<number, Record<Daypart, number>> = {};
    for (let dow = 0; dow < 7; dow++) {
      grid[dow] = {} as Record<Daypart, number>;
      for (const dp of DAYPARTS) grid[dow][dp] = 1.0;
    }
    for (const r of rows ?? []) grid[r.day_of_week][r.daypart as Daypart] = Number(r.factor);
    return { grid };
  });

export const updateOpportunityFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dayOfWeek: number; daypart: Daypart; factor: number; weekStart: string; venueId?: string }) =>
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      daypart: z.enum(DAYPARTS),
      factor: z.number().min(0.7).max(1.4),
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ...OptionalVenue,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const clamped = Math.min(1.4, Math.max(0.7, Number(data.factor)));
    const { error } = await supabase
      .from("venue_opportunity_factors")
      .upsert(
        {
          venue_id: venueId,
          day_of_week: data.dayOfWeek,
          daypart: data.daypart,
          factor: clamped,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "venue_id,day_of_week,daypart" },
      );
    if (error) throw new Error(error.message);

    const { error: rpcErr } = await supabase.rpc("recalculate_lls_for_week", {
      p_venue_id: venueId,
      p_week_start: data.weekStart,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true, factor: clamped };
  });

// ---------- thresholds ----------

export const getLlsThresholds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: row } = await supabase
      .from("venue_settings")
      .select("lls_green_threshold, lls_amber_threshold")
      .eq("venue_id", venueId)
      .maybeSingle();
    return {
      green: Number(row?.lls_green_threshold ?? 13.0),
      amber: Number(row?.lls_amber_threshold ?? 10.0),
    };
  });

// ---------- import shifts ----------

const ShiftRowInput = z.object({
  server_name: z.string().min(1),
  server_id: z.string().optional(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift_start_time: z.string().optional().nullable(),
  shift_end_time: z.string().optional().nullable(),
  daypart: z.string().optional().nullable(),
  covers_served: z.number().optional().nullable(),
  gross_sales: z.number().optional().nullable(),
  labor_cost: z.number().optional().nullable(),
});
type ShiftRowInput = z.infer<typeof ShiftRowInput>;


export const importShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceType: "sales" | "labor"; filename?: string; rows: ShiftRowInput[]; venueId?: string }) =>
    z.object({
      sourceType: z.enum(["sales", "labor"]),
      filename: z.string().optional(),
      rows: z.array(ShiftRowInput).min(1).max(10000),
      ...OptionalVenue,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId, "import");
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);

    // Create batch
    const { data: batch, error: batchErr } = await supabase
      .from("shift_import_batches")
      .insert({
        venue_id: venueId,
        source_type: data.sourceType,
        filename: data.filename ?? null,
        row_count: data.rows.length,
        status: "completed",
        created_by: userId,
      })
      .select("id")
      .single();
    if (batchErr) throw new Error(batchErr.message);

    const batchId = batch.id as string;
    const errors: Array<{ row: number; error: string }> = [];
    const touchedKeys = new Set<string>();
    const weeks = new Set<string>();

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const serverId = (r.server_id?.trim() || hashServerId(r.server_name)).slice(0, 200);
        // Normalize start time so unique key works (NULL breaks uniqueness)
        const startTime = (r.shift_start_time && r.shift_start_time.length >= 5)
          ? r.shift_start_time
          : "00:00:00";
        // Uploaded Daypart is the source of truth; time-based inference is fallback only.
        const daypart = normalizeDaypart(r.daypart) ?? dayPartFromTime(startTime);

        const dow = dayOfWeekISO(r.shift_date);

        const baseRow: any = {
          venue_id: venueId,
          server_id: serverId,
          server_name: r.server_name,
          shift_date: r.shift_date,
          shift_start_time: startTime,
          shift_end_time: r.shift_end_time || null,
          daypart,
          day_of_week: dow,
        };
        if (data.sourceType === "sales") {
          baseRow.covers_served = r.covers_served ?? null;
          baseRow.gross_sales = r.gross_sales ?? null;
          baseRow.sales_batch_id = batchId;
        } else {
          baseRow.labor_cost = r.labor_cost ?? null;
          baseRow.labor_batch_id = batchId;
        }

        const { data: existing } = await supabase
          .from("shifts")
          .select("shift_id")
          .eq("venue_id", venueId)
          .eq("server_id", serverId)
          .eq("shift_date", r.shift_date)
          .eq("shift_start_time", startTime)
          .maybeSingle();

        let shiftId: string;
        if (existing?.shift_id) {
          shiftId = existing.shift_id;
          const { error: upErr } = await supabase
            .from("shifts")
            .update({ ...baseRow, updated_at: new Date().toISOString() })
            .eq("shift_id", shiftId);
          if (upErr) throw new Error(upErr.message);
        } else {
          const { data: ins, error: insErr } = await supabase
            .from("shifts")
            .insert(baseRow)
            .select("shift_id")
            .single();
          if (insErr) throw new Error(insErr.message);
          shiftId = ins.shift_id;
        }

        touchedKeys.add(shiftId);
        const d = new Date(r.shift_date + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        weeks.add(d.toISOString().slice(0, 10));
      } catch (err: any) {
        errors.push({ row: i + 1, error: err?.message || "Unknown error" });
      }
    }

    // Recalculate LLS for each touched shift
    for (const sid of touchedKeys) {
      await supabase.rpc("calculate_lls_for_shift", { p_shift_id: sid });
    }

    return {
      batchId,
      imported: touchedKeys.size,
      errors,
      weeks: Array.from(weeks),
    };
  });

// ---------- suggest opportunity factors from venue history ----------

export const suggestOpportunityFactors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);

    const { data: rows, error } = await supabase
      .from("shifts")
      .select("day_of_week, daypart, gross_sales")
      .eq("venue_id", venueId)
      .not("gross_sales", "is", null);
    if (error) throw new Error(error.message);

    const worked = (rows ?? []).filter(
      (r: any) => r.gross_sales != null && Number(r.gross_sales) > 0,
    );
    const totalCompleted = worked.length;
    if (totalCompleted < 20) {
      return { enoughData: false as const, totalCompleted };
    }

    const buckets = new Map<string, { sum: number; n: number }>();
    let totalSum = 0;
    let totalN = 0;
    for (const r of worked as any[]) {
      const key = `${r.day_of_week}|${r.daypart}`;
      const b = buckets.get(key) ?? { sum: 0, n: 0 };
      b.sum += Number(r.gross_sales);
      b.n += 1;
      buckets.set(key, b);
      totalSum += Number(r.gross_sales);
      totalN += 1;
    }
    const venueAvg = totalSum / totalN;
    if (!(venueAvg > 0)) return { enoughData: false as const, totalCompleted };

    const round05 = (v: number) => Math.round(v * 20) / 20;
    const clamp = (v: number) => Math.min(1.4, Math.max(0.75, v));

    // Confidence weight shrinks raw factors toward 1.0 when overall sample is thin.
    const confidenceWeight =
      totalCompleted >= 200 ? 1.0 :
      totalCompleted >= 100 ? 0.75 :
      totalCompleted >= 50 ? 0.5 :
      0.25;
    const lowConfidence = totalCompleted < 50;

    const suggestions: Record<number, Record<Daypart, number>> = {};
    for (let dow = 0; dow < 7; dow++) {
      suggestions[dow] = {} as Record<Daypart, number>;
      for (const dp of DAYPARTS) {
        const b = buckets.get(`${dow}|${dp}`);
        // Per-bucket sample floor: <5 shifts → stay at 1.00 (no aggressive value).
        if (!b || b.n < 5) {
          suggestions[dow][dp] = 1.0;
        } else {
          const raw = (b.sum / b.n) / venueAvg;
          const smoothed = 1 + (raw - 1) * confidenceWeight;
          suggestions[dow][dp] = round05(clamp(smoothed));
        }
      }
    }
    return { enoughData: true as const, suggestions, totalCompleted, lowConfidence };

  });

export const rollbackBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batchId: string; venueId?: string }) =>
    z.object({ batchId: z.string().uuid(), ...OptionalVenue }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId, "import");
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);

    // Verify batch belongs to this venue
    const { data: batch } = await supabase
      .from("shift_import_batches")
      .select("id, source_type")
      .eq("id", data.batchId)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (!batch) throw new Error("Batch not found");

    if (batch.source_type === "sales") {
      // Clear sales fields on shifts where this is the sales_batch_id
      await supabase
        .from("shifts")
        .update({
          covers_served: null,
          gross_sales: null,
          rpc: null,
          base_lls: null,
          final_lls: null,
          sales_batch_id: null,
        })
        .eq("venue_id", venueId)
        .eq("sales_batch_id", data.batchId);
    } else {
      await supabase
        .from("shifts")
        .update({
          labor_cost: null,
          base_lls: null,
          final_lls: null,
          labor_batch_id: null,
        })
        .eq("venue_id", venueId)
        .eq("labor_batch_id", data.batchId);
    }

    // Delete shifts that have neither sales nor labor data left
    await supabase
      .from("shifts")
      .delete()
      .eq("venue_id", venueId)
      .is("sales_batch_id", null)
      .is("labor_batch_id", null);

    await supabase.from("shift_import_batches").delete().eq("id", data.batchId);
    return { ok: true };
  });

export const listRecentBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: rows } = await supabase
      .from("shift_import_batches")
      .select("id, source_type, filename, row_count, status, created_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(10);
    return { batches: rows ?? [] };
  });

// ---------- weekly scorecard ----------
//
// MIGRATION: This module is now a thin orchestrator over the canonical
// metrics engine in `src/lib/metrics/`. All per-shift sales/labour math,
// shift-level Opportunity-Factor application, weighted Σ/Σ aggregation,
// performance-gap math, and RAG banding flow through the engine — there
// are no parallel formulas defined here any more.
//
// Mapping into the engine:
//   ScorecardInputRow.gross_sales   → engine SalesInput.gross_sales
//                                     (used as the *uploaded* basis here:
//                                      legacy v1 data only stores gross,
//                                      so net_sales is null and the engine
//                                      derives net_sales := gross_sales)
//   ScorecardInputRow.labor_cost    → engine LaborInput.total_labor_cost
//                                     (basis = "total")
//   ScorecardInputRow.opportunity_factor → engine ShiftRow.opportunity_factor
//
// The UI consumes a 3-band RAG (green/amber/red). That is a projection of
// the canonical 4-band engine output: strong → green, tracking|monitor →
// amber, priority → red. The thresholds match the engine.

import {
  aggregate as engineAggregate,
  type ShiftRow as EngineShiftRow,
} from "@/lib/metrics/lls";
import {
  performanceGap as enginePerformanceGap,
  ragBand as engineRagBand,
} from "@/lib/metrics/gap";

export type ScorecardDaily = { dow: number; adjusted_lls: number | null; shifts: number };

export type ScorecardServer = {
  serverId: string;
  serverName: string;
  daily: ScorecardDaily[];
  shifts_worked: number;
  weekly_rpc: number | null;
  weekly_base_lls: number | null;
  weekly_adjusted_lls: number | null;
  venue_benchmark: number | null;
  performance_gap: number | null;
  rag_status: "green" | "amber" | "red" | "none";
  operator_meaning: string;
  lowSample: boolean;
};

import {
  buildOfV2Preview,
  type OpportunityFactorPreview,
  type PreviewHistoryRow,
} from "@/lib/lls/opportunity-factor-v2-preview";
import {
  buildAssessmentRows,
  persistAssessmentRows,
} from "@/lib/lls/opportunity-factor-assessments";

export type { OpportunityFactorPreview } from "@/lib/lls/opportunity-factor-v2-preview";

/**
 * Phase 20C — derive real hours per (service_date, daypart) from shifts_v2
 * so OF v2 preview can prefer paid / clock / labour-export hours over the
 * labour-cost proxy. Returns a map keyed by `${date}|${daypart}`.
 */
type V2HoursPick = { hours: number; source: "clock_hours" | "labour_export_hours" };
function buildV2HoursLookup(
  shiftsV2: Array<{
    service_date: string;
    dominant_daypart: string | null;
    labor_span_hours: number | null;
    service_duration_hours: number | null;
    clock_in: string | null;
    clock_out: string | null;
  }>,
): Map<string, V2HoursPick> {
  const acc = new Map<string, { clock: number; export_: number }>();
  for (const r of shiftsV2) {
    if (!r.service_date || !r.dominant_daypart) continue;
    const key = `${r.service_date}|${r.dominant_daypart}`;
    const cur = acc.get(key) ?? { clock: 0, export_: 0 };
    // Clock-derived hours: prefer labor_span_hours when clock_in & clock_out present.
    if (r.clock_in && r.clock_out && typeof r.labor_span_hours === "number" && r.labor_span_hours > 0) {
      cur.clock += r.labor_span_hours;
    } else if (typeof r.service_duration_hours === "number" && r.service_duration_hours > 0) {
      cur.export_ += r.service_duration_hours;
    } else if (typeof r.labor_span_hours === "number" && r.labor_span_hours > 0) {
      // labor_span_hours without clock_in/out -> treat as labour_export_hours.
      cur.export_ += r.labor_span_hours;
    }
    acc.set(key, cur);
  }
  const out = new Map<string, V2HoursPick>();
  for (const [k, v] of acc) {
    if (v.clock > 0) out.set(k, { hours: v.clock, source: "clock_hours" });
    else if (v.export_ > 0) out.set(k, { hours: v.export_, source: "labour_export_hours" });
  }
  return out;
}

/** Apply v2-derived hours onto v1 preview history rows (per date+daypart). */
function attachV2Hours(
  rows: PreviewHistoryRow[],
  lookup: Map<string, V2HoursPick>,
): PreviewHistoryRow[] {
  if (lookup.size === 0) return rows;
  // Count how many v1 rows share each key, so we can apportion hours evenly.
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.shift_date}|${r.daypart ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((r) => {
    const key = `${r.shift_date}|${r.daypart ?? ""}`;
    const pick = lookup.get(key);
    if (!pick) return r;
    const n = counts.get(key) ?? 1;
    const per = pick.hours / Math.max(1, n);
    if (pick.source === "clock_hours") {
      return { ...r, clock_hours: per };
    }
    return { ...r, labour_export_hours: per };
  });
}

export type ScorecardResult = {
  weekStart: string;
  thresholds: { green: number; amber: number };
  servers: ScorecardServer[];
  venue_benchmark: number | null;
  venue_benchmark_prev: number | null;
  venue_benchmark_trend_pct: number | null;
  toReview: Array<{ serverId: string; serverName: string; reasons: string[] }>;
  /**
   * Phase 20A — controlled OF v2 preview. Returned for manager-facing
   * surfaces only. NEVER mutates committed shift values; Adjusted LLS
   * shown to managers is still computed from stored opportunity_factor.
   */
  opportunity_factor_preview?: OpportunityFactorPreview | null;
};

function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

/**
 * 3-band UI RAG = projection of the canonical 4-band engine output.
 *   strong (>+10%)            → green
 *   tracking (±5%) / monitor  → amber
 *   priority (<-10%)          → red
 * Thresholds come from `src/lib/metrics/gap.ts` — never re-define them here.
 */
function ragFromGap(gap: number | null): "green" | "amber" | "red" | "none" {
  // v1 FROZEN spec — ±10% bands, locked by the v1-regression parity suite.
  // The canonical 5-band engine (`engineRagBand`) widens green to include
  // "outperforming" (>+5%), but the v1 manager view promised ±10%. Do NOT
  // route v1 RAG through the 5-band engine — that re-buckets gaps in the
  // (+5%, +10%) and (−10%, −5%) windows and breaks the frozen contract.
  if (gap == null || !Number.isFinite(gap)) return "none";
  if (gap >= 0.1) return "green";
  if (gap <= -0.1) return "red";
  return "amber";
}
// `engineRagBand` is kept as the source of truth for v2 / canonical UIs.
void engineRagBand;


function formatGapPct(gap: number | null): string {
  if (gap == null) return "—";
  const pct = gap * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function operatorMeaningFor(rag: "green" | "amber" | "red" | "none", gap: number | null): string {
  if (rag === "none" || gap == null) return "Not enough data to compare with venue benchmark";
  if (rag === "green") return `Outperforming venue benchmark by ${formatGapPct(gap).replace("+", "")}`;
  if (rag === "red") return `Below venue benchmark by ${formatGapPct(gap).replace("−", "")}`;
  return "Tracking with venue benchmark";
}

// Pure core extracted so the v1 regression harness can run the EXACT
// production calculation against fixture rows without spinning up the
// TanStack Start server-function middleware. Every formula delegates to
// the canonical metrics engine.
export type ScorecardInputRow = {
  server_id: string;
  server_name: string;
  shift_date: string;
  day_of_week: number;
  gross_sales: number | null;
  covers_served: number | null;
  labor_cost: number | null;
  opportunity_factor: number | null;
};

/** Adapter: production row → canonical engine ShiftRow. */
function toEngineRow(r: ScorecardInputRow): EngineShiftRow {
  return {
    // v1 data only carries gross sales — engine will derive net as gross
    // (no leakage columns present). Basis is preserved as gross-derived.
    gross_sales: r.gross_sales,
    total_labor_cost: r.labor_cost,
    opportunity_factor: r.opportunity_factor,
  };
}

export function computeWeeklyScorecardFromRows(
  all: ScorecardInputRow[],
  weekStart: string,
  thresholds: { green: number; amber: number },
): ScorecardResult {
  const ws = weekStart;
  const wsDate = new Date(ws + "T00:00:00");
  const weekEnd = new Date(wsDate);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const prevWeekStart = new Date(wsDate);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const inCurrent = (d: string) => d >= ws && d < iso(weekEnd);
  const inPrev = (d: string) => d >= iso(prevWeekStart) && d < ws;

  const worked = (r: ScorecardInputRow) =>
    r.gross_sales != null && Number(r.gross_sales) > 0 &&
    r.labor_cost != null && Number(r.labor_cost) > 0;

  // Venue benchmark for the current week — weighted Σ/Σ via engine.
  const venueCurRows = all.filter((r) => worked(r) && inCurrent(r.shift_date));
  const venuePrevRows = all.filter((r) => worked(r) && inPrev(r.shift_date));
  const venueCurAgg = engineAggregate(venueCurRows.map(toEngineRow), { allowMixedLaborBasis: true });
  const venuePrevAgg = engineAggregate(venuePrevRows.map(toEngineRow), { allowMixedLaborBasis: true });

  const venue_benchmark = venueCurAgg.adjustedLLS.value;
  const venue_benchmark_prev = venuePrevAgg.adjustedLLS.value;
  const venue_benchmark_trend_pct =
    venue_benchmark != null && venue_benchmark_prev != null && venue_benchmark_prev > 0
      ? ((venue_benchmark - venue_benchmark_prev) / venue_benchmark_prev) * 100
      : null;

  const byServer = new Map<string, { name: string; rows: ScorecardInputRow[] }>();
  for (const r of all) {
    if (!inCurrent(r.shift_date) || !worked(r)) continue;
    if (!byServer.has(r.server_id)) byServer.set(r.server_id, { name: r.server_name, rows: [] });
    byServer.get(r.server_id)!.rows.push(r);
  }

  const servers: ScorecardServer[] = [];
  for (const [serverId, { name, rows }] of byServer) {
    const daily: ScorecardDaily[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const dayRows = rows.filter((r) => r.day_of_week === dow);
      if (!dayRows.length) {
        daily.push({ dow, adjusted_lls: null, shifts: 0 });
        continue;
      }
      const dayAgg = engineAggregate(dayRows.map(toEngineRow), { allowMixedLaborBasis: true });
      daily.push({ dow, adjusted_lls: dayAgg.adjustedLLS.value, shifts: dayAgg.rowsIncluded });
    }

    // Weekly per-server totals via engine (weighted Σ/Σ, shift-level OF).
    const wkAgg = engineAggregate(rows.map(toEngineRow), { allowMixedLaborBasis: true });
    const totalCovers = rows.reduce((a, r) => a + Number(r.covers_served ?? 0), 0);
    const weekly_rpc = safeDiv(wkAgg.totalNetSales, totalCovers);
    const weekly_base_lls = wkAgg.baseLLS.value;
    const weekly_adjusted_lls = wkAgg.adjustedLLS.value;

    const performance_gap = enginePerformanceGap(weekly_adjusted_lls, venue_benchmark).value;
    const rag_status = ragFromGap(performance_gap);

    servers.push({
      serverId,
      serverName: name,
      daily,
      shifts_worked: wkAgg.rowsIncluded,
      weekly_rpc,
      weekly_base_lls,
      weekly_adjusted_lls,
      venue_benchmark,
      performance_gap,
      rag_status,
      operator_meaning: operatorMeaningFor(rag_status, performance_gap),
      lowSample: wkAgg.rowsIncluded < 3,
    });
  }

  const toReview: ScorecardResult["toReview"] = [];
  for (const s of servers) {
    if (s.lowSample) continue;
    const reasons: string[] = [];
    if (s.rag_status === "red") reasons.push(`Below venue benchmark (${formatGapPct(s.performance_gap)})`);
    if (s.shifts_worked > 5 && s.rag_status === "amber" && (s.performance_gap ?? 0) < 0) {
      reasons.push("Heavy week, tracking below benchmark");
    }
    if (reasons.length) toReview.push({ serverId: s.serverId, serverName: s.serverName, reasons });
  }

  servers.sort((a, b) => (b.weekly_adjusted_lls ?? -Infinity) - (a.weekly_adjusted_lls ?? -Infinity));

  return {
    weekStart: ws,
    thresholds,
    servers,
    venue_benchmark,
    venue_benchmark_prev,
    venue_benchmark_trend_pct,
    toReview,
  };
}


export const getWeeklyScorecard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { weekStart: string; venueId?: string }) =>
    z.object({
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ...OptionalVenue,
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ScorecardResult> => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);

    const ws = data.weekStart;
    const wsDate = new Date(ws + "T00:00:00");
    const weekEnd = new Date(wsDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const prevWeekStart = new Date(wsDate);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: vs } = await supabase
      .from("venue_settings")
      .select("lls_green_threshold, lls_amber_threshold")
      .eq("venue_id", venueId)
      .maybeSingle();
    const thresholds = {
      green: Number(vs?.lls_green_threshold ?? 13.0),
      amber: Number(vs?.lls_amber_threshold ?? 10.0),
    };

    const { data: shifts, error } = await supabase
      .from("shifts")
      .select("server_id, server_name, shift_date, day_of_week, gross_sales, covers_served, labor_cost, opportunity_factor")
      .eq("venue_id", venueId)
      .gte("shift_date", iso(prevWeekStart))
      .lt("shift_date", iso(weekEnd));
    if (error) throw new Error(error.message);

    // Phase 20A — pull 12 weeks of history for OF v2 preview computation.
    // Preview is read-only and does NOT mutate stored shift values.
    const previewStart = new Date(wsDate);
    previewStart.setDate(previewStart.getDate() - 7 * 12);
    const { data: previewHistory } = await supabase
      .from("shifts")
      .select("shift_date, day_of_week, daypart, gross_sales, covers_served, labor_cost, opportunity_factor")
      .eq("venue_id", venueId)
      .gte("shift_date", iso(previewStart))
      .lt("shift_date", iso(weekEnd));

    const result = computeWeeklyScorecardFromRows(
      (shifts ?? []) as ScorecardInputRow[],
      ws,
      thresholds,
    );

    // Build the OF v2 preview. Failures are non-fatal — never crash the LLS page.
    try {
      const toWeekStart = (date: string): string => {
        const d = new Date(date + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      };
      const historyRows = ((previewHistory ?? []) as any[]).map((r) => ({
        shift_date: r.shift_date as string,
        week_start: toWeekStart(r.shift_date as string),
        day_of_week: Number(r.day_of_week),
        daypart: (r.daypart as string | null) ?? null,
        outlet: null,
        gross_sales: r.gross_sales != null ? Number(r.gross_sales) : null,
        covers: r.covers_served != null ? Number(r.covers_served) : null,
        labor_cost: r.labor_cost != null ? Number(r.labor_cost) : null,
        opportunity_factor:
          r.opportunity_factor != null ? Number(r.opportunity_factor) : null,
      }));
      const selectedWeek = historyRows.filter((r) => r.week_start === ws);
      result.opportunity_factor_preview = buildOfV2Preview({
        venueId,
        weekStart: ws,
        history: historyRows,
        selectedWeek,
        salesBasis: "gross", // v1 schema only stores gross
        laborHoursEstimated: true, // hours unavailable in v1 scorecard query
      });
    } catch {
      result.opportunity_factor_preview = null;
    }

    return result;
  });

// ---------- scheduling leverage matrix ----------
//
// Manager-only intelligence. Pulls a longer window of shifts (default 12
// weeks) and runs the canonical scheduling-leverage engine. Server routes
// must NOT call this — gated by the auth middleware + manager venue lookup.

import {
  computeSchedulingLeverage,
  type LeverageShiftRow,
  type SchedulingLeverageResult,
} from "@/lib/lls/scheduling-leverage";

export type { SchedulingLeverageResult } from "@/lib/lls/scheduling-leverage";

export const getSchedulingLeverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { weekStart: string; weeks?: number; venueId?: string }) =>
    z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        weeks: z.number().int().min(2).max(26).optional(),
        ...OptionalVenue,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SchedulingLeverageResult> => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const weeks = data.weeks ?? 12;

    const ws = data.weekStart;
    const wsDate = new Date(ws + "T00:00:00");
    const weekEnd = new Date(wsDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const start = new Date(wsDate);
    start.setDate(start.getDate() - 7 * weeks);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // Pull venue name to use as the outlet label (single-venue case → outlet
    // scope is the venue itself). When the v2 multi-outlet schema lands, swap
    // this for a per-row outlet/revenue centre column.
    const { data: venueRow } = await supabase
      .from("venues")
      .select("name")
      .eq("id", venueId)
      .maybeSingle();
    const venueName: string | null = (venueRow as any)?.name ?? null;

    const { data: shifts, error } = await supabase
      .from("shifts")
      .select(
        "server_id, server_name, shift_date, day_of_week, daypart, gross_sales, covers_served, labor_cost, opportunity_factor, shift_start_time, shift_end_time",
      )
      .eq("venue_id", venueId)
      .gte("shift_date", iso(start))
      .lt("shift_date", iso(weekEnd));
    if (error) throw new Error(error.message);

    const rows: LeverageShiftRow[] = (shifts ?? []).map((r: any) => {
      // best-effort hours from start/end times (v1 schema does not store hours).
      let hours: number | null = null;
      if (r.shift_start_time && r.shift_end_time) {
        const [h1, m1] = String(r.shift_start_time).split(":").map(Number);
        const [h2, m2] = String(r.shift_end_time).split(":").map(Number);
        if ([h1, m1, h2, m2].every((n) => Number.isFinite(n))) {
          let mins = h2 * 60 + m2 - (h1 * 60 + m1);
          if (mins < 0) mins += 24 * 60;
          hours = mins / 60;
        }
      }
      return {
        server_id: r.server_id,
        server_name: r.server_name ?? r.server_id,
        shift_date: r.shift_date,
        day_of_week: r.day_of_week,
        daypart: r.daypart,
        // V1 single-venue schema: there is no outlet/revenue-centre column,
        // so we use the venue name as the outlet — this is a VENUE FALLBACK
        // (the engine surfaces a manager-visible warning).
        outlet: venueName,
        gross_sales: r.gross_sales != null ? Number(r.gross_sales) : null,
        net_sales: null,
        covers: r.covers_served != null ? Number(r.covers_served) : null,
        hours,
        labor_cost: r.labor_cost != null ? Number(r.labor_cost) : null,
        opportunity_factor: r.opportunity_factor != null ? Number(r.opportunity_factor) : 1,
        // Used to dedupe unique shifts (multiple POS / category / labour rows
        // for the same scheduled shift must not inflate working-pattern counts).
        shift_start: r.shift_start_time ?? null,
        shift_end: r.shift_end_time ?? null,
      };
    });

    // Whether the manager's selected week has any matched shifts.
    const selectedWeekHasShifts = rows.some(
      (r) => r.shift_date >= ws && r.shift_date < iso(weekEnd) && (r.gross_sales != null || r.labor_cost != null),
    );

    const leverage = computeSchedulingLeverage(rows, {
      // V1 has no outlet column — engine treats the venue name as a fallback.
      outletBasis: "venue_fallback",
      period: { start: iso(start), end: iso(weekEnd), weeks },
      selectedWeekHasShifts,
      selectedWeekStart: ws,
    });

    // Phase 20A — attach OF v2 preview metadata. Read-only; does NOT change
    // any baseline, matrix cell or recommendation. Failures are non-fatal.
    try {
      const toWeekStart = (date: string): string => {
        const d = new Date(date + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      };
      const historyRows = rows.map((r) => ({
        shift_date: r.shift_date,
        week_start: toWeekStart(r.shift_date),
        day_of_week: r.day_of_week,
        daypart: r.daypart ?? null,
        outlet: r.outlet ?? null,
        gross_sales: r.gross_sales,
        net_sales: r.net_sales ?? null,
        covers: r.covers,
        hours: r.hours ?? null,
        labor_cost: r.labor_cost,
        opportunity_factor: r.opportunity_factor,
      }));
      const selectedWeek = historyRows.filter((r) => r.week_start === ws);
      leverage.opportunity_factor_preview = buildOfV2Preview({
        venueId,
        weekStart: ws,
        history: historyRows,
        selectedWeek,
        salesBasis: "gross",
        laborHoursEstimated: !rows.some((r) => typeof r.hours === "number" && r.hours > 0),
      });
    } catch {
      leverage.opportunity_factor_preview = null;
    }

    return leverage;
  });



