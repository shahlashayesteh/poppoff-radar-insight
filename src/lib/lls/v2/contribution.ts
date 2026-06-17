// Canonical contribution re-derivation from active sources only.
// No cross-daypart splitting; whole-row attribution per spec §3.10.
export interface ActiveSourceContrib {
  source_kind: "sales" | "labor";
  is_active: boolean;
  gross_sales?: number | null;
  net_sales?: number | null;
  covers?: number | null;
  labor_hours?: number | null;
  labor_cost?: number | null;
}

export interface RederivedTotals {
  gross_sales: number;
  net_sales: number;
  covers: number | null;
  labor_hours: number;
  labor_cost: number;
  hourly_rate: number | null;
  status: "active" | "incomplete" | "empty";
}

export function rederive(sources: ActiveSourceContrib[]): RederivedTotals {
  let gross = 0, net = 0, hrs = 0, cost = 0;
  let covers: number | null = 0;
  let anyMissingCovers = false;
  let hasSales = false, hasLabor = false;
  for (const s of sources) {
    if (!s.is_active) continue;
    if (s.source_kind === "sales") {
      hasSales = true;
      gross += s.gross_sales ?? 0;
      net += s.net_sales ?? 0;
      if (s.covers == null) anyMissingCovers = true;
      else covers = (covers ?? 0) + s.covers;
    } else {
      hasLabor = true;
      hrs += s.labor_hours ?? 0;
      cost += s.labor_cost ?? 0;
    }
  }
  if (anyMissingCovers) covers = null;
  const status: RederivedTotals["status"] =
    hasSales && hasLabor ? "active" : hasSales || hasLabor ? "incomplete" : "empty";
  return {
    gross_sales: gross,
    net_sales: net,
    covers,
    labor_hours: hrs,
    labor_cost: cost,
    hourly_rate: hrs > 0 && cost > 0 ? cost / hrs : null,
    status,
  };
}
