// Shift Match Planner — guarded server function.
//
// Hard contract:
//   - requireSupabaseAuth + requirePaidManagerEntitlement + assertVenueAccess.
//   - Read-only. No mutation. No persistence.
//   - Venue scoped. Does not change LLS / ROI / OF v2 / import code paths.
//   - MUST NOT be imported from any /server/* route.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";
import { assertVenueAccess } from "@/lib/venue-access";
import {
  buildShiftMatchPlan,
  type HistoricalShift,
  type ShiftMatchPlan,
  type Daypart,
  type SalesBasis,
  type LaborBasis,
  type ReliabilityClass,
  type IdentityMethod,
} from "@/lib/scheduling/shift-match-planner";

const Input = z.object({
  venueId: z.string().min(1),
  /** Optional override: how many weeks of history to read (default 8). */
  weeks: z.number().int().min(2).max(16).optional(),
});

function asSalesBasis(v: any): SalesBasis {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s.includes("net") && s.includes("derived")) return "net_derived";
  if (s === "net" || s === "net_sales") return "net";
  if (s.includes("gross")) return "gross_as_net";
  if (s === "unknown") return "unknown";
  return null;
}
function asLaborBasis(v: any): LaborBasis {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s.includes("fully")) return "fully_loaded";
  if (s.includes("wage")) return "wage_only";
  if (s.includes("rate")) return "rate_times_hours";
  if (s === "unknown") return "unknown";
  return null;
}
function asReliability(v: any): ReliabilityClass {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (["measured", "derived", "estimated", "contextual", "untrusted"].includes(s)) return s as ReliabilityClass;
  return null;
}
function asIdentityMethod(v: any): IdentityMethod {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === "exact_employee_id" || s === "employee_id") return "exact_employee_id";
  if (s === "confirmed_alias" || s === "alias") return "confirmed_alias";
  if (s === "exact_unique_name" || s === "unique_name") return "exact_unique_name";
  if (s === "single_fuzzy_candidate" || s === "fuzzy") return "single_fuzzy_candidate";
  if (s === "ambiguous") return "ambiguous";
  if (s === "missing" || s === "none") return "missing";
  return null;
}

export const getShiftMatchPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof Input>) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{
    plan: ShiftMatchPlan;
    venueId: string;
    venueName: string;
    weeklyPriorityCategory: string | null;
    weeksObserved: number;
  }> => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    await assertVenueAccess(supabase, userId, data.venueId);

    const weeks = data.weeks ?? 8;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - weeks * 7);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);

    const [{ data: shifts, error }, venueRow, priorityRow] = await Promise.all([
      supabase
        .from("shifts")
        .select(
          "shift_date, day_of_week, daypart, server_id, server_name, gross_sales, covers_served, labor_cost, opportunity_factor, sales_basis, labor_basis, reliability_class, identity_match_method, identity_match_confidence",
        )
        .eq("venue_id", data.venueId)
        .gte("shift_date", startISO)
        .lte("shift_date", endISO),
      supabase.from("venues").select("name").eq("id", data.venueId).maybeSingle(),
      supabase
        .from("weekly_priorities")
        .select("category, status")
        .eq("venue_id", data.venueId)
        .in("status", ["sent_to_servers", "approved", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

    // Real-hours signal from shifts_v2, best-effort.
    let realHoursByDate = new Map<string, number>();
    try {
      const { data: v2 } = await supabase
        .from("shifts_v2")
        .select("service_date, labor_span_hours, service_duration_hours")
        .eq("venue_id", data.venueId)
        .gte("service_date", startISO)
        .lte("service_date", endISO);
      for (const r of (v2 ?? []) as any[]) {
        const k = String(r.service_date);
        const h = Number(r.labor_span_hours ?? r.service_duration_hours ?? 0);
        if (!Number.isFinite(h) || h <= 0) continue;
        realHoursByDate.set(k, (realHoursByDate.get(k) ?? 0) + h);
      }
    } catch {
      realHoursByDate = new Map();
    }

    // Group rows by date to distribute real hours by labour-cost share.
    const grouped = new Map<string, any[]>();
    for (const r of (shifts ?? []) as any[]) {
      const k = String(r.shift_date);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(r);
    }

    const historical: HistoricalShift[] = [];
    const daypartSet = new Set<Daypart>();
    for (const [date, rows] of grouped) {
      const dailyHours = realHoursByDate.get(date);
      const totalLab = rows.reduce((s, r) => s + (Number(r.labor_cost ?? 0) || 0), 0);
      for (const r of rows) {
        const labCost = r.labor_cost != null ? Number(r.labor_cost) : null;
        const share = totalLab > 0 ? (labCost ?? 0) / totalLab : 1 / rows.length;
        const realHours = dailyHours != null ? dailyHours * share : null;
        daypartSet.add(String(r.daypart));
        historical.push({
          shiftDate: r.shift_date,
          dayOfWeek: Number(r.day_of_week),
          daypart: String(r.daypart),
          serverId: String(r.server_id),
          serverName: r.server_name ?? null,
          grossSales: r.gross_sales != null ? Number(r.gross_sales) : null,
          netSales: null,
          laborCost: labCost,
          realHours,
          coversServed: r.covers_served != null ? Number(r.covers_served) : null,
          opportunityFactor: r.opportunity_factor != null ? Number(r.opportunity_factor) : null,
          salesBasis: asSalesBasis(r.sales_basis),
          laborBasis: asLaborBasis(r.labor_basis),
          reliabilityClass: asReliability(r.reliability_class),
          identityMethod: asIdentityMethod(r.identity_match_method),
          identityConfidence: r.identity_match_confidence != null ? Number(r.identity_match_confidence) : null,
          outletVerified: false,
          sectionContextOnly: false,
          crossOutletEligible: false,
        });
      }
    }

    const weeklyPriorityCategory: string | null = (priorityRow as any)?.data?.category ?? null;

    const plan = buildShiftMatchPlan({
      shifts: historical,
      dayparts: Array.from(daypartSet).sort(),
      weeklyPriorityCategory,
    });

    const distinctWeeks = new Set(historical.map((s) => s.shiftDate.slice(0, 7) + "-" + Math.floor(new Date(s.shiftDate).getDate() / 7))).size;

    return {
      plan,
      venueId: data.venueId,
      venueName: (venueRow as any)?.data?.name ?? "Your venue",
      weeklyPriorityCategory,
      weeksObserved: distinctWeeks,
    };
  });
