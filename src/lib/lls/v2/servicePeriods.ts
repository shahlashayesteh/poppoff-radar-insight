// Venue service period aggregation + attribution status.
import { ATTRIBUTION } from "./config";
import type { CanonicalShift } from "./types";

export type AttributionStatus = "reconciled" | "warning" | "held_for_review" | "blocked" | "no_control";

export interface ServicePeriodTotals {
  venue_id: string;
  service_date: string;
  daypart: string;
  gross_sales: number;
  net_sales: number;
  covers: number;
  labor_hours: number;
  labor_cost: number;
  server_count: number;
}

export function aggregatePeriod(shifts: CanonicalShift[]): Omit<ServicePeriodTotals, "venue_id" | "service_date" | "daypart"> {
  const ids = new Set<string>();
  let gross = 0, net = 0, covers = 0, hrs = 0, cost = 0;
  for (const s of shifts) {
    if (s.status !== "active") continue;
    gross += s.gross_sales;
    net += s.net_sales ?? 0;
    covers += s.covers ?? 0;
    hrs += s.hours_worked;
    cost += s.labor_cost;
    ids.add(s.identity_id);
  }
  return { gross_sales: gross, net_sales: net, covers, labor_hours: hrs, labor_cost: cost, server_count: ids.size };
}

export function attributionStatus(
  canonicalGross: number,
  canonicalCovers: number,
  control: { gross: number | null; covers: number | null } | null,
): { status: AttributionStatus; period_deviation: number | null } {
  if (!control || (control.gross == null && control.covers == null)) {
    return { status: "no_control", period_deviation: null };
  }
  const gPct = control.gross && control.gross > 0 ? canonicalGross / control.gross : null;
  const cPct = control.covers && control.covers > 0 ? canonicalCovers / control.covers : null;
  const gDev = gPct != null ? Math.abs(1 - gPct) : 0;
  const cDev = cPct != null ? Math.abs(1 - cPct) : 0;
  const dev = Math.max(gDev, cDev);
  let status: AttributionStatus;
  if (dev <= ATTRIBUTION.reconciledMax) status = "reconciled";
  else if (dev <= ATTRIBUTION.warningMax) status = "warning";
  else if (dev <= ATTRIBUTION.heldMax) status = "held_for_review";
  else status = "blocked";
  return { status, period_deviation: dev };
}
