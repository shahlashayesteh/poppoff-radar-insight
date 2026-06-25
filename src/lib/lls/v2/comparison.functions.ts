// Manager-facing v1 vs v2 weekly comparison (shadow mode).
// Aggregates venue-level weekly totals from each model and returns
// a buildComparison() payload. Gated by venues.lls_compare_mode.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";
import { buildComparison, type V1WeeklyView, type V2WeeklyView } from "./comparison";
import { benchmarkConfidence, resultConfidence, lowerBand, ragStatus } from "./confidence";
import { performanceGap, modelledRevenueOpportunity } from "./calculations";
import type { ConfidenceBand } from "./config";

import { resolveManagerVenueId } from "@/lib/venue-access";

const Input = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Phase 16A — optional explicit venue. Multi-venue / head-office callers
  // MUST supply it; single-venue managers can omit.
  venueId: z.string().uuid().optional(),
});

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Phase 16A: replace owner-only earliest-venue lookup with the membership-
// validated resolver. Falls through to a venue row read so we can keep the
// existing compare-mode + baseline metadata in the payload.
async function resolveVenue(supabase: any, userId: string, requestedVenueId?: string) {
  const venueId = await resolveManagerVenueId(supabase, userId, requestedVenueId);
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, lls_compare_mode, lls_active_model_version, lls_v2_baseline_weeks")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Selected venue not found");
  return data as {
    id: string; name: string; lls_compare_mode: boolean;
    lls_active_model_version: string; lls_v2_baseline_weeks: number;
  };
}

export interface ComparisonPayload {
  venue: { id: string; name: string; active_model_version: string };
  weekStart: string;
  weekEnd: string;
  baselineWeeks: number;
  comparison: ReturnType<typeof buildComparison>;
  v1_totals: { shifts: number; gross_sales: number; labor_cost: number; adj_labor_cost: number; covers: number };
  v2_totals: {
    shifts: number; gross_sales: number; labor_cost: number; adj_labor_cost: number;
    covers: number | null; single_sided: number; needs_review: number; cross_daypart: number;
  };
}


export const getLlsComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof Input>) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ComparisonPayload> => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venue = await resolveVenue(supabase, userId);
    if (!venue.lls_compare_mode) {
      throw new Error("Comparison mode is not enabled for this venue.");
    }
    const ws = data.weekStart;
    const we = addDays(ws, 7);
    const baselineWeeks = venue.lls_v2_baseline_weeks ?? 8;
    const baselineStart = addDays(ws, -7 * baselineWeeks);

    // --- v1 weekly aggregate (venue level, shifts table) ---
    const { data: v1Rows, error: v1Err } = await supabase
      .from("shifts")
      .select("gross_sales, labor_cost, covers_served, opportunity_factor")
      .eq("venue_id", venue.id)
      .gte("shift_date", ws)
      .lt("shift_date", we);
    if (v1Err) throw new Error(v1Err.message);

    let v1Gross = 0, v1Labor = 0, v1AdjLabor = 0, v1Covers = 0, v1Shifts = 0;
    for (const r of v1Rows ?? []) {
      const gross = Number(r.gross_sales ?? 0);
      const labor = Number(r.labor_cost ?? 0);
      if (gross <= 0 || labor <= 0) continue;
      const of = r.opportunity_factor != null && Number(r.opportunity_factor) > 0
        ? Number(r.opportunity_factor) : 1.0;
      v1Gross += gross;
      v1Labor += labor;
      v1AdjLabor += labor * of;
      v1Covers += Number(r.covers_served ?? 0);
      v1Shifts += 1;
    }

    // --- v1 historical benchmark (aligned to baselineWeeks for apples-to-apples comparison with v2) ---
    const v1HistStart = baselineStart;

    const { data: v1Hist } = await supabase
      .from("shifts")
      .select("gross_sales, labor_cost, opportunity_factor")
      .eq("venue_id", venue.id)
      .gte("shift_date", v1HistStart)
      .lt("shift_date", ws);
    let v1HistGross = 0, v1HistAdj = 0;
    for (const r of v1Hist ?? []) {
      const gross = Number(r.gross_sales ?? 0);
      const labor = Number(r.labor_cost ?? 0);
      if (gross <= 0 || labor <= 0) continue;
      const of = r.opportunity_factor != null && Number(r.opportunity_factor) > 0
        ? Number(r.opportunity_factor) : 1.0;
      v1HistGross += gross;
      v1HistAdj += labor * of;
    }
    const v1Benchmark = v1HistAdj > 0 ? v1HistGross / v1HistAdj : null;

    const v1AdjLls = v1AdjLabor > 0 ? v1Gross / v1AdjLabor : null;
    const v1BaseLls = v1Labor > 0 ? v1Gross / v1Labor : null;
    const v1Rpc = v1Covers > 0 ? v1Gross / v1Covers : null;
    const v1Bench = v1Benchmark;
    const v1Gap = v1AdjLls != null && v1Bench != null && v1Bench > 0
      ? v1AdjLls / v1Bench - 1 : null;
    const v1RagStrict: V1WeeklyView["rag"] =
      v1Gap == null ? null : v1Gap >= 0.10 ? "green" : v1Gap <= -0.10 ? "red" : "amber";

    const v1View: V1WeeklyView = {
      weekly_rpc: v1Rpc,
      base_lls: v1BaseLls,
      adjusted_lls: v1AdjLls,
      benchmark_adjusted_lls: v1Bench,
      performance_gap: v1Gap,
      rag: v1RagStrict,
    };

    // --- v2 weekly aggregate (shifts_v2) ---
    const { data: v2Rows, error: v2Err } = await supabase
      .from("shifts_v2")
      .select("gross_sales, labor_cost, labor_span_hours, covers, is_active, is_single_sided, needs_review, cross_daypart")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .gte("service_date", ws)
      .lt("service_date", we);
    if (v2Err) throw new Error(v2Err.message);

    // System OF for venue (mean across overrides if present) — venue-level fallback to 1.0
    const { data: ofRows } = await supabase
      .from("venue_opportunity_factors")
      .select("factor")
      .eq("venue_id", venue.id);
    const ofs = (ofRows ?? []).map((r: any) => Number(r.factor)).filter((n: number) => n > 0);
    const venueOf = ofs.length ? ofs.reduce((a: number, b: number) => a + b, 0) / ofs.length : 1.0;

    let v2Gross = 0, v2Labor = 0, v2Hours = 0, v2Shifts = 0, v2CoversSum = 0;
    let v2CoversMissing = false, v2SingleSided = 0, v2NeedsReview = 0, v2Cross = 0;
    for (const r of v2Rows ?? []) {
      if (r.is_single_sided) v2SingleSided += 1;
      if (r.needs_review) v2NeedsReview += 1;
      if (r.cross_daypart) v2Cross += 1;
      const gross = Number(r.gross_sales ?? 0);
      const labor = Number(r.labor_cost ?? 0);
      const hours = Number(r.labor_span_hours ?? 0);
      if (gross <= 0 || labor <= 0 || hours <= 0) continue;
      v2Gross += gross;
      v2Labor += labor;
      v2Hours += hours;
      v2Shifts += 1;
      if (r.covers == null) v2CoversMissing = true;
      else v2CoversSum += Number(r.covers);
    }
    const v2AdjLabor = v2Labor * venueOf;
    const v2Covers = v2CoversMissing ? null : v2CoversSum;
    const v2BaseLls = v2Labor > 0 ? v2Gross / v2Labor : null;
    const v2AdjLls = v2AdjLabor > 0 ? v2Gross / v2AdjLabor : null;
    const v2Rpc = v2Covers && v2Covers > 0 ? v2Gross / v2Covers : null;

    // --- v2 benchmark: baselineWeeks of prior venue-level shifts_v2 ---
    const { data: v2HistRows } = await supabase
      .from("shifts_v2")
      .select("gross_sales, labor_cost, labor_span_hours, covers, service_date")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .gte("service_date", baselineStart)
      .lt("service_date", ws);
    let bGross = 0, bLabor = 0, bHours = 0, bCovers = 0, bShifts = 0;
    const weeksSeen = new Set<string>();
    for (const r of v2HistRows ?? []) {
      const gross = Number(r.gross_sales ?? 0);
      const labor = Number(r.labor_cost ?? 0);
      const hours = Number(r.labor_span_hours ?? 0);
      if (gross <= 0 || labor <= 0 || hours <= 0) continue;
      bGross += gross;
      bLabor += labor;
      bHours += hours;
      bCovers += Number(r.covers ?? 0);
      bShifts += 1;
      weeksSeen.add(String(r.service_date).slice(0, 7));
    }
    const bAdjLabor = bLabor * venueOf;
    const comparableAdjLls = bAdjLabor > 0 ? bGross / bAdjLabor : null;
    const expectedSales = v2AdjLabor > 0 && comparableAdjLls != null
      ? v2AdjLabor * comparableAdjLls : null;
    const v2Gap = performanceGap(v2AdjLls, comparableAdjLls);
    const revenueOpp = expectedSales != null && v2Gross != null
      ? modelledRevenueOpportunity(expectedSales, v2Gross) : null;

    // confidence (venue-level approximation)
    const completeness = v2Shifts > 0 && (v2Rows?.length ?? 0) > 0
      ? v2Shifts / (v2Rows?.length ?? 1) : 0;
    const benchBand: ConfidenceBand = benchmarkConfidence({
      comparable_periods: bShifts,
      weeks_represented: weeksSeen.size,
      historical_labor_hours: bHours,
      historical_covers: bCovers,
      attribution_ok_pct: 1.0,
      labor_span_fallback_pct: 0.0,
      unresolved_outliers_pct: 0.0,
    });
    const resBand: ConfidenceBand = resultConfidence({
      valid_shifts: v2Shifts,
      labor_hours: v2Hours,
      covers: v2Covers ?? 0,
      completeness_pct: completeness,
      unresolved_identity_conflict: false,
      unresolved_duplicate: false,
      cross_daypart_pct: v2Rows && v2Rows.length ? v2Cross / v2Rows.length : 0,
      has_single_sided_exception: v2SingleSided > 0,
    });
    const finalBand = lowerBand(benchBand, resBand);
    const v2Rag = ragStatus(v2Gap, finalBand);

    const v2View: V2WeeklyView = {
      weekly_rpc: v2Rpc,
      base_lls: v2BaseLls,
      adjusted_lls: v2AdjLls,
      comparable_adjusted_lls: comparableAdjLls,
      performance_gap: v2Gap,
      rag: v2Rag,
      benchmark_confidence: benchBand,
      result_confidence: resBand,
      final_confidence: finalBand,
      expected_sales: expectedSales,
      modelled_revenue_opportunity: revenueOpp,
    };

    const comparison = buildComparison(v1View, v2View, {
      hadSingleSidedExcluded: v2SingleSided > 0,
      hadDuplicatesRemoved: false,
      hadIdentityMerges: false,
      hadMissingCovers: v2CoversMissing,
      attribQualityAdjusted: false,
    });

    return {
      venue: {
        id: venue.id,
        name: venue.name,
        active_model_version: venue.lls_active_model_version,
      },
      weekStart: ws,
      weekEnd: we,
      baselineWeeks,

      comparison,
      v1_totals: {
        shifts: v1Shifts, gross_sales: v1Gross, labor_cost: v1Labor,
        adj_labor_cost: v1AdjLabor, covers: v1Covers,
      },
      v2_totals: {
        shifts: v2Shifts, gross_sales: v2Gross, labor_cost: v2Labor,
        adj_labor_cost: v2AdjLabor, covers: v2Covers,
        single_sided: v2SingleSided, needs_review: v2NeedsReview, cross_daypart: v2Cross,
      },
    };
  });
