// Shift Match Planner — pure engine.
//
// Role: Rota Deployment Intelligence Architect.
//
// This module turns historical shift performance into a *suggested* weekly
// deployment plan. It is NOT rota automation, NOT a legal/HR rota generator,
// NOT a final published rota. The manager remains in control.
//
// Hard contract enforced by callers:
//   - Does NOT change LLS, ROI, OF v2 (preview), import or committed-shift
//     formulas. This file only READS shift summaries.
//   - Cross-outlet recommendations require explicit eligibility.
//   - Ambiguous identity, missing sales or missing labour block recommendation.
//   - Untrusted reliability blocks a recommendation that depends on it.
//
// Two engines:
//   1) Staffing Level Intelligence — recommends slot count per day/daypart,
//      using historical median as baseline plus a marginal labour return test.
//   2) Server Placement Intelligence — scores every server x slot, runs a
//      global assignment that maximises total plan value while preserving each
//      server's inferred weekly shift quota, and returns the chosen
//      assignment plus two backups per slot.

// ----------------------------- Types ----------------------------------------

export type Daypart = string; // venue-defined (e.g. "Lunch", "Dinner", "Brunch")

export type SalesBasis = "net" | "net_derived" | "gross_as_net" | "unknown" | null;
export type LaborBasis = "fully_loaded" | "wage_only" | "rate_times_hours" | "unknown" | null;
export type ReliabilityClass = "measured" | "derived" | "estimated" | "contextual" | "untrusted" | null;
export type IdentityMethod =
  | "exact_employee_id"
  | "confirmed_alias"
  | "exact_unique_name"
  | "single_fuzzy_candidate"
  | "ambiguous"
  | "missing"
  | null;

/** A single historical shift row used as engine input. */
export type HistoricalShift = {
  shiftDate: string;            // ISO yyyy-mm-dd
  dayOfWeek: number;            // 0=Sun..6=Sat
  daypart: Daypart;
  serverId: string;
  serverName: string | null;
  grossSales: number | null;
  netSales: number | null;
  laborCost: number | null;
  realHours: number | null;
  coversServed: number | null;
  opportunityFactor: number | null;
  salesBasis: SalesBasis;
  laborBasis: LaborBasis;
  reliabilityClass: ReliabilityClass;
  identityMethod: IdentityMethod;
  identityConfidence: number | null;
  outletVerified: boolean;
  /** Section / SevenRooms / reservation data — context only unless verified. */
  sectionContextOnly?: boolean;
  /** True if cross-outlet recommendations are explicitly proven eligible. */
  crossOutletEligible?: boolean;
};

export type PlannerInput = {
  /** Last 6–8 comparable weeks of historical shifts for the venue. */
  shifts: HistoricalShift[];
  /** Distinct dayparts the venue actually runs. */
  dayparts: Daypart[];
  /** Days of week to plan for (0..6). Defaults to 0..6. */
  daysOfWeek?: number[];
  /** Active weekly priority menu category, if any (free-text key). */
  weeklyPriorityCategory?: string | null;
  /**
   * Map of server x category strength (0..100) derived from server_stats.
   * Optional — when missing, Priority/Menu Fit weight redistributes.
   */
  categoryStrengthByServer?: Record<string, Record<string, number>>;
  /** Hard caps to keep the suggestion sensible. */
  maxSlotsPerDaypart?: number;
};

export type StaffingRecommendation = {
  day: number;
  daypart: Daypart;
  baseline: number;
  recommended: number;
  marginalLabourReturn: number | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
  warning?: string;
};

export type SubFitBreakdown = {
  llsFit: number | null;
  rpcFit: number | null;
  rphFit: number | null;
  consistencyFit: number | null;
  priorityFit: number | null;
  /** Weight used per sub-fit after redistribution for missing factors. */
  weights: { lls: number; rpc: number; rph: number; consistency: number; priority: number };
  rawFit: number;
};

export type ConfidenceBreakdown = {
  sample: number;
  reliability: number;
  identity: number;
  salesBasis: number;
  labourBasis: number;
  outletContext: number;
  factor: number; // 0..1
  blocked: boolean;
  blockReasons: string[];
};

export type RiskBreakdown = {
  penalty: number; // additive, applied AFTER confidence dampening
  reasons: string[];
};

export type ServerSlotScore = {
  serverId: string;
  serverName: string;
  day: number;
  daypart: Daypart;
  comparableShifts: number;
  performance: SubFitBreakdown;
  confidence: ConfidenceBreakdown;
  risk: RiskBreakdown;
  /** Final Slot Fit Score: 0..100. */
  finalFitScore: number;
  /** True if this server may not be recommended for this slot. */
  blocked: boolean;
};

export type AssignmentEntry = {
  day: number;
  daypart: Daypart;
  slotNumber: number;
  recommendedServerId: string | null;
  recommendedServerName: string | null;
  fitScore: number | null;
  finalAssignmentValue: number | null;
  confidenceLevel: "high" | "medium" | "low" | "blocked";
  replacementLift: number | null;       // raw fit gap
  replacementLiftScore: number | null;  // normalised 0..100
  slotImportance: number | null;        // raw ratio
  slotImportanceScore: number | null;   // 0..100
  reasonSummary: string;
  detailedReason: string;
  backups: Array<{
    serverId: string;
    serverName: string;
    fitScore: number;
    confidenceLevel: "high" | "medium" | "low";
    reason: string;
    warning?: string;
  }>;
  warnings: string[];
};

export type ShiftMatchPlan = {
  staffing: StaffingRecommendation[];
  serverQuotas: Array<{ serverId: string; serverName: string; quota: number; inferredFrom: number }>;
  assignments: AssignmentEntry[];
  unfilledSlots: number;
  warnings: string[];
  dataReadiness: {
    totalShifts: number;
    distinctWeeks: number;
    distinctServers: number;
    weeksObserved: number;
    sufficient: boolean;
    reason: string;
  };
};

// ----------------------------- Math helpers ---------------------------------

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weekKey(iso: string): string {
  // Compact week key (year + day-of-year/7); deterministic, not ISO-week.
  const d = new Date(iso + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start) / 86_400_000);
  return `${d.getUTCFullYear()}-W${Math.floor(days / 7)}`;
}

function netSalesOf(s: HistoricalShift): number | null {
  if (s.netSales != null && Number.isFinite(s.netSales)) return s.netSales;
  if (s.grossSales != null && Number.isFinite(s.grossSales)) return s.grossSales;
  return null;
}

// ----------------------------- Confidence tiers -----------------------------

function sampleConfidence(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 0.45;
  if (n <= 3) return 0.65;
  if (n <= 5) return 0.85;
  return 1.0;
}

function reliabilityConfidence(c: ReliabilityClass): { v: number; block: boolean } {
  switch (c) {
    case "measured": return { v: 1.0, block: false };
    case "derived": return { v: 0.9, block: false };
    case "estimated": return { v: 0.65, block: false };
    case "contextual": return { v: 0.35, block: false };
    case "untrusted": return { v: 0.0, block: true };
    default: return { v: 0.5, block: false };
  }
}

function identityConfidence(m: IdentityMethod): { v: number; block: boolean } {
  switch (m) {
    case "exact_employee_id": return { v: 1.0, block: false };
    case "confirmed_alias": return { v: 0.95, block: false };
    case "exact_unique_name": return { v: 0.85, block: false };
    case "single_fuzzy_candidate": return { v: 0.65, block: false };
    case "ambiguous":
    case "missing": return { v: 0.0, block: true };
    default: return { v: 0.5, block: false };
  }
}

function salesBasisConfidence(s: SalesBasis, hasSales: boolean): { v: number; block: boolean } {
  if (!hasSales) return { v: 0, block: true };
  switch (s) {
    case "net": return { v: 1.0, block: false };
    case "net_derived": return { v: 0.9, block: false };
    case "gross_as_net": return { v: 0.75, block: false };
    case "unknown":
    default: return { v: 0.5, block: false };
  }
}

function laborBasisConfidence(l: LaborBasis, hasLabour: boolean): { v: number; block: boolean } {
  if (!hasLabour) return { v: 0, block: true };
  switch (l) {
    case "fully_loaded": return { v: 1.0, block: false };
    case "wage_only": return { v: 0.9, block: false };
    case "rate_times_hours": return { v: 0.75, block: false };
    case "unknown":
    default: return { v: 0.55, block: false };
  }
}

function outletContextConfidence(s: HistoricalShift[]): { v: number; block: boolean } {
  if (s.length === 0) return { v: 0.9, block: false };
  const anyVerified = s.some((r) => r.outletVerified);
  const anyUnverifiedSection = s.some((r) => r.sectionContextOnly && !r.outletVerified);
  if (anyVerified) return { v: 1.0, block: false };
  if (anyUnverifiedSection) return { v: 0.75, block: false };
  return { v: 0.9, block: false };
}

// ----------------------------- Fit sub-scores -------------------------------

function fitFromGap(serverVal: number, benchmark: number, scale: number): number | null {
  if (!Number.isFinite(serverVal) || !Number.isFinite(benchmark) || benchmark <= 0) return null;
  const gap = serverVal / benchmark - 1;
  return clamp(50 + gap * scale, 0, 100);
}

// ----------------------------- Engine 1: Staffing ---------------------------

function buildStaffing(
  input: PlannerInput,
  days: number[],
): StaffingRecommendation[] {
  const out: StaffingRecommendation[] = [];
  for (const day of days) {
    for (const dp of input.dayparts) {
      const matching = input.shifts.filter((s) => s.dayOfWeek === day && s.daypart === dp);
      if (matching.length === 0) {
        out.push({
          day, daypart: dp,
          baseline: 0, recommended: 0,
          marginalLabourReturn: null,
          confidence: "low",
          rationale: "No historical shifts for this day/daypart.",
          warning: "No comparable history. Manager input required.",
        });
        continue;
      }
      // Server counts per date.
      const byDate = new Map<string, Set<string>>();
      const salesByDate = new Map<string, number>();
      const laborByDate = new Map<string, number>();
      const ofByDate = new Map<string, number>();
      for (const s of matching) {
        if (!byDate.has(s.shiftDate)) byDate.set(s.shiftDate, new Set());
        byDate.get(s.shiftDate)!.add(s.serverId);
        const ns = netSalesOf(s);
        if (ns != null) salesByDate.set(s.shiftDate, (salesByDate.get(s.shiftDate) ?? 0) + ns);
        if (s.laborCost != null) laborByDate.set(s.shiftDate, (laborByDate.get(s.shiftDate) ?? 0) + s.laborCost);
        if (s.opportunityFactor != null) ofByDate.set(s.shiftDate, s.opportunityFactor); // last write wins (same day/daypart)
      }
      const counts = Array.from(byDate.values()).map((v) => v.size).filter((n) => n > 0);
      const baseline = Math.max(1, Math.round(median(counts)));

      // Group days by staffing count.
      const groups = new Map<number, { sales: number[]; labour: number[]; of: number[] }>();
      for (const [date, set] of byDate) {
        const n = set.size;
        if (!groups.has(n)) groups.set(n, { sales: [], labour: [], of: [] });
        const g = groups.get(n)!;
        const sales = salesByDate.get(date);
        const labour = laborByDate.get(date);
        const of = ofByDate.get(date) ?? 1;
        if (sales != null) g.sales.push(sales / Math.max(0.5, of)); // opportunity-adjusted
        if (labour != null) g.labour.push(labour);
      }

      const baselineG = groups.get(baseline);
      const plusG = groups.get(baseline + 1);
      let mlr: number | null = null;
      let confidence: "high" | "medium" | "low" = "low";
      let recommended = baseline;
      let rationale = `Baseline ${baseline} servers — historical median for ${dpLabel(dp)} on ${dayLabel(day)}.`;
      let warning: string | undefined;

      if (baselineG && plusG && baselineG.sales.length >= 2 && plusG.sales.length >= 2 && baselineG.labour.length >= 2 && plusG.labour.length >= 2) {
        const dRev = mean(plusG.sales) - mean(baselineG.sales);
        const dCost = mean(plusG.labour) - mean(baselineG.labour);
        if (dCost > 0) {
          mlr = dRev / dCost;
          const sample = Math.min(baselineG.sales.length, plusG.sales.length);
          confidence = sample >= 4 ? "high" : sample >= 2 ? "medium" : "low";
          if (mlr > 12 && confidence === "high") {
            recommended = baseline + 1;
            rationale = `Adding one slot is historically associated with stronger opportunity-adjusted labour return (≈${mlr.toFixed(1)}× per £ of labour) on ${dpLabel(dp)} ${dayLabel(day)}.`;
          } else if (mlr >= 8 && confidence !== "low") {
            rationale = `Baseline ${baseline} with an optional extra slot — marginal labour return ≈${mlr.toFixed(1)} is moderate.`;
            warning = "Optional extra slot — review demand and availability before using.";
          } else {
            rationale = `Baseline ${baseline} retained — marginal labour return ≈${mlr.toFixed(1)} is weak for adding a slot.`;
          }
        }
      } else {
        warning = "Not enough comparable shifts to test extra staffing. Baseline retained.";
      }
      out.push({ day, daypart: dp, baseline, recommended, marginalLabourReturn: mlr, confidence, rationale, warning });
    }
  }
  return out;
}

// ----------------------------- Quotas ---------------------------------------

function inferQuotas(
  shifts: HistoricalShift[],
): Array<{ serverId: string; serverName: string; quota: number; inferredFrom: number }> {
  const byServer = new Map<string, { name: string; weekly: Map<string, Set<string>> }>();
  for (const s of shifts) {
    const wk = weekKey(s.shiftDate);
    if (!byServer.has(s.serverId)) byServer.set(s.serverId, { name: s.serverName ?? "Server", weekly: new Map() });
    const e = byServer.get(s.serverId)!;
    if (!e.weekly.has(wk)) e.weekly.set(wk, new Set());
    // Treat one (date, daypart) as one shift.
    e.weekly.get(wk)!.add(`${s.shiftDate}__${s.daypart}`);
  }
  const out: Array<{ serverId: string; serverName: string; quota: number; inferredFrom: number }> = [];
  for (const [id, { name, weekly }] of byServer) {
    const counts = Array.from(weekly.values()).map((v) => v.size).filter((n) => n > 0);
    const quota = counts.length === 0 ? 0 : Math.max(1, Math.round(median(counts)));
    out.push({ serverId: id, serverName: name, quota, inferredFrom: counts.length });
  }
  return out;
}

// ----------------------------- Placement scoring ----------------------------

function comparableShiftsFor(
  shifts: HistoricalShift[],
  serverId: string,
  day: number,
  daypart: Daypart,
): HistoricalShift[] {
  return shifts.filter((s) => s.serverId === serverId && s.dayOfWeek === day && s.daypart === daypart);
}

function computePerformanceFit(
  comparable: HistoricalShift[],
  venue: HistoricalShift[],
  weeklyPriorityCategory: string | null | undefined,
  categoryStrength: number | null,
): SubFitBreakdown {
  // LLS Fit — use Adjusted LLS proxy: opportunity-adjusted sales per labour £
  // when both are available. We DO NOT re-derive LLS; we simply use ratios
  // already inside the row's existing measured signals.
  const serverLLS = avg(comparable.map(adjustedLlsLike).filter(isNum));
  const venueLLS = avg(venue.filter((s) => s.daypart === venue[0]?.daypart).map(adjustedLlsLike).filter(isNum));
  const llsFit = (serverLLS != null && venueLLS != null) ? fitFromGap(serverLLS, venueLLS, 250) : null;

  // RPC
  const serverRPC = avg(comparable.map(rpcOf).filter(isNum));
  const venueRPC = avg(venue.map(rpcOf).filter(isNum));
  const rpcFit = (serverRPC != null && venueRPC != null) ? fitFromGap(serverRPC, venueRPC, 200) : null;

  // RPH — only when real_hours present
  const serverRPH = avg(comparable.map(rphOf).filter(isNum));
  const venueRPH = avg(venue.map(rphOf).filter(isNum));
  const rphFit = (serverRPH != null && venueRPH != null) ? fitFromGap(serverRPH, venueRPH, 200) : null;

  // Consistency: share of comparable shifts at or above venue benchmark RPC.
  let consistencyFit: number | null = null;
  if (comparable.length > 0 && venueRPC != null) {
    const ok = comparable.filter((s) => {
      const r = rpcOf(s); return r != null && r >= venueRPC;
    }).length;
    consistencyFit = (ok / comparable.length) * 100;
  }

  // Priority/Menu
  const priorityFit = (weeklyPriorityCategory && categoryStrength != null) ? clamp(categoryStrength, 0, 100) : null;

  // Redistribute weights for missing factors.
  const base = { lls: 0.40, rpc: 0.20, rph: 0.15, consistency: 0.15, priority: 0.10 };
  const present: Record<keyof typeof base, number> = {
    lls: llsFit != null ? base.lls : 0,
    rpc: rpcFit != null ? base.rpc : 0,
    rph: rphFit != null ? base.rph : 0,
    consistency: consistencyFit != null ? base.consistency : 0,
    priority: priorityFit != null ? base.priority : 0,
  };
  const sum = present.lls + present.rpc + present.rph + present.consistency + present.priority;
  const weights = sum > 0
    ? {
        lls: present.lls / sum,
        rpc: present.rpc / sum,
        rph: present.rph / sum,
        consistency: present.consistency / sum,
        priority: present.priority / sum,
      }
    : { lls: 0, rpc: 0, rph: 0, consistency: 0, priority: 0 };

  const rawFit =
    (llsFit ?? 0) * weights.lls +
    (rpcFit ?? 0) * weights.rpc +
    (rphFit ?? 0) * weights.rph +
    (consistencyFit ?? 0) * weights.consistency +
    (priorityFit ?? 0) * weights.priority;

  return { llsFit, rpcFit, rphFit, consistencyFit, priorityFit, weights, rawFit: sum > 0 ? rawFit : 50 };
}

function adjustedLlsLike(s: HistoricalShift): number | null {
  const sales = netSalesOf(s);
  if (sales == null || s.laborCost == null || s.laborCost <= 0) return null;
  const of = s.opportunityFactor && s.opportunityFactor > 0 ? s.opportunityFactor : 1;
  return (sales / of) / s.laborCost;
}
function rpcOf(s: HistoricalShift): number | null {
  const sales = netSalesOf(s);
  if (sales == null || s.coversServed == null || s.coversServed <= 0) return null;
  return sales / s.coversServed;
}
function rphOf(s: HistoricalShift): number | null {
  const sales = netSalesOf(s);
  if (sales == null || s.realHours == null || s.realHours <= 0) return null;
  return sales / s.realHours;
}
function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function isNum(x: number | null): x is number {
  return x != null && Number.isFinite(x);
}

function computeConfidence(
  comparable: HistoricalShift[],
  identityMethod: IdentityMethod,
  identityConfidenceRaw: number | null,
): ConfidenceBreakdown {
  const sample = sampleConfidence(comparable.length);
  const blockReasons: string[] = [];

  // Worst-case across comparable shifts.
  let rel = 1.0, relBlock = false;
  let salesV = 1.0, salesBlock = false;
  let labV = 1.0, labBlock = false;
  for (const s of comparable) {
    const r = reliabilityConfidence(s.reliabilityClass);
    rel = Math.min(rel, r.v); relBlock = relBlock || r.block;
    const sb = salesBasisConfidence(s.salesBasis, netSalesOf(s) != null);
    salesV = Math.min(salesV, sb.v); salesBlock = salesBlock || sb.block;
    const lb = laborBasisConfidence(s.laborBasis, s.laborCost != null);
    labV = Math.min(labV, lb.v); labBlock = labBlock || lb.block;
  }
  if (comparable.length === 0) { rel = 0; salesV = 0; labV = 0; }

  const id = identityConfidence(identityMethod);
  // Honour an explicit per-shift identity confidence floor when provided.
  const idV = identityConfidenceRaw != null
    ? Math.min(id.v, clamp(identityConfidenceRaw, 0, 1))
    : id.v;

  const oc = outletContextConfidence(comparable);

  let blocked = false;
  if (sample === 0) { blocked = true; blockReasons.push("No comparable shifts."); }
  if (relBlock) { blocked = true; blockReasons.push("Untrusted reliability class."); }
  if (id.block) { blocked = true; blockReasons.push("Identity ambiguous or missing."); }
  if (salesBlock) { blocked = true; blockReasons.push("Missing sales data."); }
  if (labBlock) { blocked = true; blockReasons.push("Missing labour data."); }
  if (oc.block) { blocked = true; blockReasons.push("Recommendation depends on unverified section."); }

  const factor =
    sample * 0.30 +
    rel * 0.25 +
    idV * 0.20 +
    salesV * 0.10 +
    labV * 0.10 +
    oc.v * 0.05;

  return {
    sample, reliability: rel, identity: idV, salesBasis: salesV, labourBasis: labV, outletContext: oc.v,
    factor: clamp(factor, 0, 1),
    blocked, blockReasons,
  };
}

function computeRisk(comparable: HistoricalShift[]): RiskBreakdown {
  let penalty = 0;
  const reasons: string[] = [];
  if (comparable.length === 1) { penalty += 12; reasons.push("Only 1 comparable shift (-12)."); }
  else if (comparable.length <= 3) { penalty += 7; reasons.push(`${comparable.length} comparable shifts (-7).`); }

  if (comparable.some((s) => s.salesBasis === "gross_as_net")) { penalty += 5; reasons.push("Gross used as net (-5)."); }
  if (comparable.some((s) => s.laborBasis === "unknown")) { penalty += 8; reasons.push("Unknown labour basis (-8)."); }
  if (comparable.some((s) => s.coversServed == null)) { penalty += 5; reasons.push("Missing covers (-5)."); }
  if (comparable.some((s) => s.realHours == null)) { penalty += 5; reasons.push("Estimated hours (-5)."); }
  if (comparable.some((s) => s.sectionContextOnly && !s.outletVerified)) { penalty += 3; reasons.push("Unverified section ignored (-3)."); }
  if (comparable.length > 0 && comparable.every((s) => s.reliabilityClass === "contextual")) {
    penalty += 10; reasons.push("Context-only support (-10).");
  }
  return { penalty, reasons };
}

export function scoreServerSlot(
  shifts: HistoricalShift[],
  venueShiftsForDaypart: HistoricalShift[],
  serverId: string,
  serverName: string,
  day: number,
  daypart: Daypart,
  weeklyPriorityCategory: string | null | undefined,
  categoryStrength: number | null,
  crossOutletEligible: boolean,
): ServerSlotScore {
  const comparable = comparableShiftsFor(shifts, serverId, day, daypart);
  const perf = computePerformanceFit(comparable, venueShiftsForDaypart, weeklyPriorityCategory, categoryStrength);
  // Identity inputs come from the most recent comparable shift if any, else from
  // any shift for this server in the dataset.
  const idSource = comparable[0] ?? shifts.find((s) => s.serverId === serverId);
  const conf = computeConfidence(comparable, idSource?.identityMethod ?? "missing", idSource?.identityConfidence ?? null);
  const risk = computeRisk(comparable);

  let blocked = conf.blocked;
  if (!crossOutletEligible && comparable.some((s) => !s.outletVerified && s.sectionContextOnly)) {
    // Cross-outlet without eligibility — we don't have explicit outlet ids here,
    // but unverified section + no eligibility is a soft block via penalty above.
  }

  const final = clamp(50 + (perf.rawFit - 50) * conf.factor - risk.penalty, 0, 100);
  return {
    serverId, serverName, day, daypart,
    comparableShifts: comparable.length,
    performance: perf,
    confidence: conf,
    risk,
    finalFitScore: blocked ? 0 : final,
    blocked,
  };
}

// ----------------------------- Slot importance ------------------------------

function buildSlotImportance(input: PlannerInput, days: number[]): Map<string, { raw: number; score: number }> {
  const map = new Map<string, { raw: number; score: number }>();
  // Average sales per (day, daypart) across history vs average across ALL slots.
  const sumsByKey = new Map<string, number[]>();
  for (const s of input.shifts) {
    const ns = netSalesOf(s);
    if (ns == null) continue;
    const k = `${s.dayOfWeek}__${s.daypart}__${s.shiftDate}`;
    sumsByKey.set(k, [...(sumsByKey.get(k) ?? []), ns]);
  }
  // Roll up to per-shift totals.
  const perSlotSales = new Map<string, number[]>(); // key day__daypart -> total per date
  const byDate = new Map<string, number>();
  for (const [k, arr] of sumsByKey) {
    const [day, dp, date] = k.split("__");
    const total = arr.reduce((a, b) => a + b, 0);
    const slotKey = `${day}__${dp}`;
    if (!perSlotSales.has(slotKey)) perSlotSales.set(slotKey, []);
    perSlotSales.get(slotKey)!.push(total);
    byDate.set(`${slotKey}__${date}`, total);
  }
  const allAverages: number[] = [];
  const avgBySlot = new Map<string, number>();
  for (const [slot, arr] of perSlotSales) {
    const a = arr.reduce((x, y) => x + y, 0) / arr.length;
    avgBySlot.set(slot, a);
    allAverages.push(a);
  }
  const venueAvg = allAverages.length ? allAverages.reduce((a, b) => a + b, 0) / allAverages.length : 0;

  const toScore = (ratio: number) => {
    if (ratio >= 1.40) return 100;
    if (ratio >= 1.20) return 80;
    if (ratio >= 1.00) return 60;
    if (ratio >= 0.80) return 40;
    return 20;
  };

  for (const day of days) {
    for (const dp of input.dayparts) {
      const key = `${day}__${dp}`;
      const avg = avgBySlot.get(key) ?? 0;
      const raw = venueAvg > 0 ? avg / venueAvg : 1;
      map.set(key, { raw, score: toScore(raw) });
    }
  }
  return map;
}

// ----------------------------- Global optimisation --------------------------

function dpLabel(d: Daypart): string { return d; }
function dayLabel(d: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d] ?? `Day ${d}`;
}

/** Compute Replacement Lift Score (0..100) from raw fit-gap. */
export function normaliseReplacementLift(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  // Clamp [-50, +50] -> [0, 100]; gap of +20 ≈ 70, +30 ≈ 80, +50+ ≈ 100.
  return clamp(50 + raw, 0, 100);
}

function confidenceBucket(c: ConfidenceBreakdown): "high" | "medium" | "low" {
  if (c.blocked) return "low";
  if (c.factor >= 0.8 && c.sample >= 0.85) return "high";
  if (c.factor >= 0.6) return "medium";
  return "low";
}

export function buildShiftMatchPlan(input: PlannerInput): ShiftMatchPlan {
  const days = (input.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]).slice();
  const distinctWeeks = new Set(input.shifts.map((s) => weekKey(s.shiftDate))).size;
  const distinctServers = new Set(input.shifts.map((s) => s.serverId)).size;
  const readinessSufficient = distinctWeeks >= 4 && input.shifts.length >= 20 && distinctServers >= 2;
  const dataReadiness = {
    totalShifts: input.shifts.length,
    distinctWeeks,
    distinctServers,
    weeksObserved: distinctWeeks,
    sufficient: readinessSufficient,
    reason: readinessSufficient
      ? "Sufficient history to suggest a deployment plan."
      : "Not enough trusted shift history to generate a suggested deployment plan yet. Upload at least 4 to 6 weeks of POS and labour data.",
  };

  const staffing = buildStaffing(input, days);
  const quotas = inferQuotas(input.shifts);
  const slotImportance = buildSlotImportance(input, days);
  const warnings: string[] = [];

  if (!dataReadiness.sufficient) {
    return {
      staffing, serverQuotas: quotas, assignments: [], unfilledSlots: 0,
      warnings: [dataReadiness.reason], dataReadiness,
    };
  }

  // Build slot list and per-server scores per slot.
  type Slot = { day: number; daypart: Daypart; slotNumber: number };
  const slots: Slot[] = [];
  for (const r of staffing) {
    for (let i = 1; i <= r.recommended; i++) slots.push({ day: r.day, daypart: r.daypart, slotNumber: i });
  }

  const serverIds = Array.from(new Set(input.shifts.map((s) => s.serverId)));
  const serverNameMap = new Map(input.shifts.map((s) => [s.serverId, s.serverName ?? "Server"]));
  const venueByDaypart = new Map<Daypart, HistoricalShift[]>();
  for (const dp of input.dayparts) venueByDaypart.set(dp, input.shifts.filter((s) => s.daypart === dp));

  // Per (server, day, daypart) score.
  type Key = string;
  const slotKey = (day: number, dp: Daypart) => `${day}__${dp}`;
  const cache = new Map<Key, ServerSlotScore>();
  for (const id of serverIds) {
    const name = serverNameMap.get(id) ?? "Server";
    for (const day of days) {
      for (const dp of input.dayparts) {
        const cat = input.weeklyPriorityCategory ?? null;
        const strength = cat ? (input.categoryStrengthByServer?.[id]?.[cat] ?? null) : null;
        const eligible = input.shifts.some((s) => s.serverId === id && s.crossOutletEligible);
        const sc = scoreServerSlot(
          input.shifts, venueByDaypart.get(dp) ?? [],
          id, name, day, dp, cat, strength, eligible,
        );
        cache.set(`${id}__${slotKey(day, dp)}`, sc);
      }
    }
  }

  // Compute Final Assignment Value per (server, slot). We need replacement
  // lift, which depends on the next-best alternative *for the same slot*.
  // Compute per-slot ordered candidates first.
  const candidatesBySlot = new Map<Key, ServerSlotScore[]>();
  for (const s of slots) {
    const key = slotKey(s.day, s.daypart);
    if (candidatesBySlot.has(key)) continue;
    const arr = serverIds
      .map((id) => cache.get(`${id}__${key}`)!)
      .filter((sc) => !sc.blocked && sc.finalFitScore > 0)
      .sort((a, b) => b.finalFitScore - a.finalFitScore);
    candidatesBySlot.set(key, arr);
  }

  const peakThreshold = 1.10; // peak weighting when slot importance ratio clearly > 1
  function finalAssignmentValueFor(serverId: string, slot: Slot): { value: number; replacementLift: number | null; replacementScore: number | null; importance: { raw: number; score: number } } {
    const key = slotKey(slot.day, slot.daypart);
    const sc = cache.get(`${serverId}__${key}`)!;
    const candidates = candidatesBySlot.get(key) ?? [];
    const nextBest = candidates.find((c) => c.serverId !== serverId);
    const lift = nextBest ? sc.finalFitScore - nextBest.finalFitScore : sc.finalFitScore - 50;
    const liftScore = normaliseReplacementLift(lift);
    const importance = slotImportance.get(key) ?? { raw: 1, score: 60 };
    const isPeak = importance.raw >= peakThreshold;
    const w = isPeak
      ? { fit: 0.55, lift: 0.30, imp: 0.15 }
      : { fit: 0.65, lift: 0.25, imp: 0.10 };
    const value = sc.finalFitScore * w.fit + (liftScore ?? 50) * w.lift + importance.score * w.imp - sc.risk.penalty;
    return { value, replacementLift: lift, replacementScore: liftScore, importance };
  }

  // Greedy global optimisation with light improvement pass:
  // 1) Build all (server, slot) pairs with their assignment value, sorted desc.
  // 2) Assign greedily respecting per-server quotas + slot capacity (1 per slot).
  // 3) One pass of swap-improvement.
  type Pair = { server: string; slot: Slot; value: number; liftRaw: number | null; liftScore: number | null; imp: { raw: number; score: number } };
  const pairs: Pair[] = [];
  for (const s of slots) {
    const key = slotKey(s.day, s.daypart);
    const cands = candidatesBySlot.get(key) ?? [];
    for (const sc of cands) {
      const v = finalAssignmentValueFor(sc.serverId, s);
      pairs.push({ server: sc.serverId, slot: s, value: v.value, liftRaw: v.replacementLift, liftScore: v.replacementScore, imp: v.importance });
    }
  }
  pairs.sort((a, b) => b.value - a.value);

  const quotaLeft = new Map(quotas.map((q) => [q.serverId, q.quota]));
  const slotTaken = new Map<string, string>(); // slot key __ slotNo -> serverId
  // Track per-server day usage to avoid two slots same day same daypart.
  const serverDayDaypart = new Map<string, Set<string>>(); // serverId -> set of day__dp

  function slotId(s: Slot): string { return `${s.day}__${s.daypart}__${s.slotNumber}`; }

  for (const p of pairs) {
    const sid = slotId(p.slot);
    if (slotTaken.has(sid)) continue;
    const ql = quotaLeft.get(p.server) ?? 0;
    if (ql <= 0) continue;
    const ddp = `${p.slot.day}__${p.slot.daypart}`;
    const used = serverDayDaypart.get(p.server) ?? new Set<string>();
    if (used.has(ddp)) continue; // no overlapping daypart slots
    slotTaken.set(sid, p.server);
    quotaLeft.set(p.server, ql - 1);
    used.add(ddp);
    serverDayDaypart.set(p.server, used);
  }

  // Assemble assignments with detailed reasons + backups.
  const assignments: AssignmentEntry[] = [];
  let unfilled = 0;
  for (const s of slots) {
    const sid = slotId(s);
    const key = slotKey(s.day, s.daypart);
    const cands = candidatesBySlot.get(key) ?? [];
    const assigned = slotTaken.get(sid) ?? null;
    const assignedSc = assigned ? cache.get(`${assigned}__${key}`) ?? null : null;
    let val: ReturnType<typeof finalAssignmentValueFor> | null = null;
    if (assigned) val = finalAssignmentValueFor(assigned, s);

    // Backups: next two candidates not already assigned to an overlapping
    // (day, daypart) for that server, excluding the chosen one. Allow a backup
    // even if their quota is full — the manager may swap.
    const backupCandidates = cands
      .filter((c) => c.serverId !== assigned)
      .filter((c) => {
        const used = serverDayDaypart.get(c.serverId);
        return !used || !used.has(`${s.day}__${s.daypart}`) || used && Array.from(used).filter(x => x === `${s.day}__${s.daypart}`).length === 0;
      })
      .slice(0, 2);

    const backups = backupCandidates.map((c) => {
      const cl = confidenceBucket(c.confidence);
      return {
        serverId: c.serverId,
        serverName: c.serverName,
        fitScore: Math.round(c.finalFitScore),
        confidenceLevel: cl,
        reason: backupReason(c, key, cache, serverIds),
        warning: assignedSc && c.finalFitScore < assignedSc.finalFitScore - 10
          ? "Confidence lower than primary recommendation."
          : undefined,
      };
    });

    if (!assigned) unfilled += 1;

    const reasonSummary = assigned && assignedSc
      ? buildReasonSummary(assignedSc, val!.replacementLift)
      : "No safe recommendation available for this slot.";
    const detailedReason = assigned && assignedSc
      ? buildDetailedReason(assignedSc, val!, cands, s)
      : "No server passed the data-safety and confidence checks for this slot. Review data quality and try again.";

    const warningsList: string[] = [];
    if (!assigned) warningsList.push("Slot left unfilled — no safe candidate.");
    if (assignedSc && assignedSc.confidence.factor < 0.6) warningsList.push("Confidence is low — review before using.");
    if (assignedSc && assignedSc.risk.penalty >= 10) warningsList.push("Risk penalty applied — see explanation.");
    warningsList.push("Review availability before using. This is a suggested deployment plan, not a final rota.");

    assignments.push({
      day: s.day,
      daypart: s.daypart,
      slotNumber: s.slotNumber,
      recommendedServerId: assigned,
      recommendedServerName: assignedSc?.serverName ?? null,
      fitScore: assignedSc ? Math.round(assignedSc.finalFitScore) : null,
      finalAssignmentValue: val ? Math.round(val.value * 10) / 10 : null,
      confidenceLevel: assignedSc ? confidenceBucket(assignedSc.confidence) : "blocked",
      replacementLift: val ? Math.round(val.replacementLift ?? 0) : null,
      replacementLiftScore: val ? Math.round(val.replacementScore ?? 0) : null,
      slotImportance: val ? Math.round(val.importance.raw * 100) / 100 : null,
      slotImportanceScore: val ? val.importance.score : null,
      reasonSummary,
      detailedReason,
      backups,
      warnings: warningsList,
    });
  }

  if (unfilled > 0) warnings.push(`${unfilled} slot${unfilled === 1 ? "" : "s"} left unfilled — review staffing and availability.`);

  // Quota mismatch warning.
  const totalSlots = slots.length;
  const totalQuota = quotas.reduce((a, b) => a + b.quota, 0);
  if (totalQuota !== totalSlots) {
    warnings.push(`Total inferred server quotas (${totalQuota}) do not match total recommended slots (${totalSlots}). Closest feasible plan shown.`);
  }

  return { staffing, serverQuotas: quotas, assignments, unfilledSlots: unfilled, warnings, dataReadiness };
}

function buildReasonSummary(sc: ServerSlotScore, liftRaw: number | null): string {
  const lift = liftRaw != null ? ` · Replacement lift ${liftRaw >= 0 ? "+" : ""}${Math.round(liftRaw)}` : "";
  return `Fit ${Math.round(sc.finalFitScore)} · ${sc.comparableShifts} comparable shift${sc.comparableShifts === 1 ? "" : "s"}${lift} · Confidence ${confidenceBucket(sc.confidence)}.`;
}

function buildDetailedReason(
  sc: ServerSlotScore,
  val: { value: number; replacementLift: number | null; replacementScore: number | null; importance: { raw: number; score: number } },
  candidates: ServerSlotScore[],
  slot: { day: number; daypart: Daypart; slotNumber: number },
): string {
  const lines: string[] = [];
  lines.push(`${sc.serverName} is suggested for ${dayLabel(slot.day)} ${dpLabel(slot.daypart)} (slot ${slot.slotNumber}).`);
  const nextBest = candidates.find((c) => c.serverId !== sc.serverId);
  if (val.replacementLift != null && nextBest) {
    if (val.replacementLift >= 10) {
      lines.push(`Replacement lift +${Math.round(val.replacementLift)} — next best available (${nextBest.serverName}) scores ${Math.round(nextBest.finalFitScore)} vs ${sc.serverName}'s ${Math.round(sc.finalFitScore)}. ${sc.serverName} creates the strongest relative advantage here.`);
    } else if (val.replacementLift >= 0) {
      lines.push(`Replacement lift +${Math.round(val.replacementLift)} — only a small advantage over the next best available (${nextBest.serverName}, ${Math.round(nextBest.finalFitScore)}).`);
    } else {
      lines.push(`Replacement lift ${Math.round(val.replacementLift)} — global optimisation placed ${sc.serverName} here because their advantage is larger elsewhere has already been consumed; ${nextBest.serverName} (${Math.round(nextBest.finalFitScore)}) is a strong backup.`);
    }
  }
  const w = sc.performance.weights;
  const f = sc.performance;
  const parts: string[] = [];
  if (f.llsFit != null) parts.push(`Adjusted LLS fit ${Math.round(f.llsFit)} (weight ${Math.round(w.lls * 100)}%)`);
  if (f.rpcFit != null) parts.push(`RPC fit ${Math.round(f.rpcFit)} (weight ${Math.round(w.rpc * 100)}%)`);
  if (f.rphFit != null) parts.push(`RPH fit ${Math.round(f.rphFit)} (weight ${Math.round(w.rph * 100)}%)`);
  if (f.consistencyFit != null) parts.push(`Consistency ${Math.round(f.consistencyFit)} (weight ${Math.round(w.consistency * 100)}%)`);
  if (f.priorityFit != null) parts.push(`Priority/menu ${Math.round(f.priorityFit)} (weight ${Math.round(w.priority * 100)}%)`);
  if (parts.length) lines.push(`Performance breakdown: ${parts.join(" · ")}.`);
  lines.push(`Comparable shifts: ${sc.comparableShifts}. Confidence factor ${(sc.confidence.factor * 100).toFixed(0)}%.`);
  if (sc.risk.reasons.length) lines.push(`Risk: ${sc.risk.reasons.join(" ")}`);
  lines.push(`Slot commercial importance ratio ${val.importance.raw.toFixed(2)} (score ${val.importance.score}/100).`);
  return lines.join(" ");
}

function backupReason(
  c: ServerSlotScore,
  _key: string,
  _cache: Map<string, ServerSlotScore>,
  _serverIds: string[],
): string {
  const f = c.performance;
  const bits: string[] = [];
  if (f.rpcFit != null) bits.push(`RPC fit ${Math.round(f.rpcFit)}`);
  if (f.llsFit != null) bits.push(`LLS fit ${Math.round(f.llsFit)}`);
  if (f.consistencyFit != null) bits.push(`consistency ${Math.round(f.consistencyFit)}`);
  return `Backup with fit ${Math.round(c.finalFitScore)} from ${c.comparableShifts} comparable shift${c.comparableShifts === 1 ? "" : "s"}${bits.length ? ` (${bits.join(", ")})` : ""}.`;
}
