// Phase 22 — Enterprise ROI server functions.
//
// Hard contract:
//   - Every handler runs requirePaidManagerEntitlement + assertVenueAccess.
//   - All reads are venue-scoped.
//   - No mutation. Read-only by design.
//   - /server/* routes MUST NOT import this module — manager intelligence.
//   - Adjusted LLS remains v1; OF v2 is preview-only metadata if surfaced.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";
import { assertVenueAccess } from "@/lib/venue-access";
import {
  buildRoiReport,
  buildExportSummary,
  type RoiReport,
  type RoiShiftRow,
} from "@/lib/roi/calculations";

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RoiInput = z.object({
  venueId: z.string().min(1),
  baselineStart: ISO,
  baselineEnd: ISO,
  currentStart: ISO,
  currentEnd: ISO,
  monthlySubscriptionCost: z.number().nonnegative().optional(),
  implementationCost: z.number().nonnegative().optional(),
  recoverabilityFactor: z.number().min(0).max(1).optional(),
});

function weeksBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso + "T00:00:00").getTime();
  const b = new Date(endIso + "T00:00:00").getTime();
  const days = Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
  return Math.max(1, days / 7);
}

async function loadShiftsForRange(
  supabase: any,
  venueId: string,
  startIso: string,
  endIso: string,
): Promise<RoiShiftRow[]> {
  const { data: shifts, error } = await supabase
    .from("shifts")
    .select(
      "shift_date, gross_sales, covers_served, labor_cost, opportunity_factor, sales_basis, labor_basis, reliability_class, identity_match_method, identity_match_confidence",
    )
    .eq("venue_id", venueId)
    .gte("shift_date", startIso)
    .lt("shift_date", endIso);
  if (error) throw new Error(error.message);

  // Pull real-hours signal from shifts_v2 (Phase 20C). Best-effort.
  let realHoursByDate: Map<string, number> = new Map();
  try {
    const { data: v2 } = await supabase
      .from("shifts_v2")
      .select("service_date, labor_span_hours, service_duration_hours")
      .eq("venue_id", venueId)
      .eq("is_active", true)
      .gte("service_date", startIso)
      .lt("service_date", endIso);
    for (const r of (v2 ?? []) as any[]) {
      const k = String(r.service_date);
      const h = Number(r.labor_span_hours ?? r.service_duration_hours ?? 0);
      if (!Number.isFinite(h) || h <= 0) continue;
      realHoursByDate.set(k, (realHoursByDate.get(k) ?? 0) + h);
    }
  } catch {
    realHoursByDate = new Map();
  }

  // Distribute the daily real-hours across the shifts of that date for the
  // engine's per-row signal. We weight by labor_cost share so multi-server
  // days don't double-count hours when summed.
  const byDate: Map<string, RoiShiftRow[]> = new Map();
  for (const r of (shifts ?? []) as any[]) {
    const row: RoiShiftRow = {
      shift_date: r.shift_date,
      gross_sales: r.gross_sales != null ? Number(r.gross_sales) : null,
      net_sales: null,
      labor_cost: r.labor_cost != null ? Number(r.labor_cost) : null,
      opportunity_factor: r.opportunity_factor != null ? Number(r.opportunity_factor) : null,
      covers_served: r.covers_served != null ? Number(r.covers_served) : null,
      sales_basis: r.sales_basis ?? null,
      labor_basis: r.labor_basis ?? null,
      reliability_class: r.reliability_class ?? null,
      identity_match_method: r.identity_match_method ?? null,
      identity_match_confidence:
        r.identity_match_confidence != null ? Number(r.identity_match_confidence) : null,
      real_hours: null,
    };
    const arr = byDate.get(row.shift_date) ?? [];
    arr.push(row);
    byDate.set(row.shift_date, arr);
  }
  for (const [date, rows] of byDate) {
    const dailyHours = realHoursByDate.get(date);
    if (!dailyHours) continue;
    const totalCost = rows.reduce((s, r) => s + (r.labor_cost ?? 0), 0);
    for (const r of rows) {
      const share = totalCost > 0 ? (r.labor_cost ?? 0) / totalCost : 1 / rows.length;
      r.real_hours = dailyHours * share;
    }
  }
  return Array.from(byDate.values()).flat();
}

export const getRoiReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof RoiInput>) => RoiInput.parse(d))
  .handler(async ({ data, context }): Promise<{
    report: RoiReport;
    exportSummary: string;
    period: {
      venueId: string;
      venueName: string;
      baselineStart: string;
      baselineEnd: string;
      currentStart: string;
      currentEnd: string;
    };
  }> => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    await assertVenueAccess(supabase, userId, data.venueId);

    const [baseRows, curRows, venueRow] = await Promise.all([
      loadShiftsForRange(supabase, data.venueId, data.baselineStart, data.baselineEnd),
      loadShiftsForRange(supabase, data.venueId, data.currentStart, data.currentEnd),
      supabase.from("venues").select("name").eq("id", data.venueId).maybeSingle(),
    ]);

    const report = buildRoiReport({
      baselineRows: baseRows,
      currentRows: curRows,
      assumptions: {
        weeksInPeriod: weeksBetween(data.currentStart, data.currentEnd),
        monthlySubscriptionCost: data.monthlySubscriptionCost ?? 199,
        implementationCost: data.implementationCost ?? 0,
        recoverabilityFactor: data.recoverabilityFactor ?? 0.30,
      },
    });

    const venueName: string = (venueRow as any)?.data?.name ?? "Your venue";
    const exportSummary = buildExportSummary(report, {
      venueName,
      periodLabel: `${data.currentStart} → ${data.currentEnd}`,
    });

    return {
      report,
      exportSummary,
      period: {
        venueId: data.venueId,
        venueName,
        baselineStart: data.baselineStart,
        baselineEnd: data.baselineEnd,
        currentStart: data.currentStart,
        currentEnd: data.currentEnd,
      },
    };
  });
