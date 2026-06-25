// Phase 23 — Pilot & Sales Demo Readiness.
//
// Pure helpers that turn a Phase 22 RoiReport into a pilot-ready package:
//   - Pilot readiness checklist (data, identity, basis, sample size)
//   - Measured uplift already achieved (baseline → current movement)
//   - Modelled remaining opportunity (from ROI engine — never "guaranteed")
//   - Leadership summary copy that keeps the two strictly separated
//
// Hard rules:
//   - Never mix measured uplift and modelled opportunity in the same number.
//   - Never use "guaranteed" anywhere.
//   - No LLS formula changes. Adjusted LLS stays applied v1.
//   - Pure module: no I/O, no DOM, no server access.

import type {
  RoiReport,
  PeriodMovement,
  DataQualitySummary,
} from "@/lib/roi/calculations";

// ---------- types ----------

export type ChecklistStatus = "ok" | "warn" | "missing";

export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
  optional?: boolean;
}

export interface ChecklistGroup {
  title: string;
  items: ChecklistItem[];
}

export interface PilotChecklist {
  readinessScore: number;     // 0..100
  readinessLevel: "ready" | "almost" | "not_ready";
  groups: ChecklistGroup[];
  blockingCount: number;
  warningCount: number;
}

export interface MeasuredUplift {
  /** True when at least one core metric improved between baseline and current. */
  hasImprovement: boolean;
  /** Lines that describe ONLY metrics that improved (positive delta). */
  improvementLines: string[];
  /** Lines for metrics that regressed (negative delta). */
  regressionLines: string[];
}

export interface ModelledOpportunity {
  modelledRecoverableRevenuePeriod: number;
  modelledRecoverableRevenueMonthly: number;
  recoverabilityFactor: number;
  rpcGap: number;
  coversUsed: number;
  /** True when current already meets/exceeds baseline RPC. */
  noGap: boolean;
}

export interface PilotPackage {
  checklist: PilotChecklist;
  measuredUplift: MeasuredUplift;
  modelledOpportunity: ModelledOpportunity;
  leadershipSummary: string;
}

// ---------- pilot readiness checklist ----------

export const REQUIRED_DATA_FILES: ChecklistItem[] = [
  { id: "pos_sales", label: "POS sales export", status: "missing", detail: "Per-shift sales with timestamps." },
  { id: "item_sales", label: "Item-level sales (where available)", status: "missing", detail: "Used for menu intelligence.", optional: true },
  { id: "server_ids", label: "Server / employee IDs on sales", status: "missing", detail: "Required for accurate per-server attribution." },
  { id: "check_timestamps", label: "Check timestamps", status: "missing", detail: "Required for daypart and shift bucketing." },
  { id: "labour_hours", label: "Labour hours or timeclock export", status: "missing", detail: "Required for true RPH and LLS." },
  { id: "wage_basis", label: "Wage / labour basis (where available)", status: "missing", detail: "Wages-only vs wages-with-oncosts.", optional: true },
  { id: "menu_export", label: "Menu / category export", status: "missing", detail: "Optional context for menu intelligence.", optional: true },
  { id: "rota", label: "Rota / schedule export", status: "missing", detail: "Optional context only — not used for hard scoring unless verified.", optional: true },
];

const CONTEXTUAL_NOTE: ChecklistItem = {
  id: "contextual_note",
  label: "Section, table allocation and reservation data are optional context only unless verified.",
  status: "warn",
  detail: "Not used for hard scoring. Will not change LLS or ROI numbers.",
  optional: true,
};

export function evaluateChecklist(
  dq: DataQualitySummary,
  movement: PeriodMovement,
): PilotChecklist {
  const data: ChecklistItem[] = [];

  // Sample size (required)
  if (dq.sampleSizeShifts >= 60) data.push({ id: "sample", label: "Sample size", status: "ok", detail: `${dq.sampleSizeShifts} shifts in current period.` });
  else if (dq.sampleSizeShifts >= 20) data.push({ id: "sample", label: "Sample size", status: "warn", detail: `${dq.sampleSizeShifts} shifts — modest, expect medium confidence.` });
  else data.push({ id: "sample", label: "Sample size", status: "missing", detail: `${dq.sampleSizeShifts} shifts — below the 20-shift minimum for a defensible pilot.` });

  // Sales basis
  data.push(
    dq.grossUsedAsNetWarnings === 0
      ? { id: "sales_basis", label: "Net sales available", status: "ok", detail: "All shifts have net sales." }
      : { id: "sales_basis", label: "Net sales available", status: "warn", detail: `${dq.grossUsedAsNetWarnings} shifts used gross as net — re-import with net.` },
  );

  // Labour basis
  data.push(
    dq.unknownLaborBasisWarnings === 0
      ? { id: "labour_basis", label: "Labour basis known", status: "ok", detail: "Wages-only / wages-with-oncosts identified for all shifts." }
      : { id: "labour_basis", label: "Labour basis known", status: "warn", detail: `${dq.unknownLaborBasisWarnings} shifts have unknown labour basis.` },
  );

  // Hours
  data.push(
    dq.hoursMissing
      ? { id: "hours", label: "Real labour hours", status: "warn", detail: "Hours not available — RPH uses cost proxy only." }
      : { id: "hours", label: "Real labour hours", status: "ok", detail: "Clock / labour-export hours present." },
  );

  // Identity
  data.push(
    dq.identityAmbiguityWarnings === 0
      ? { id: "identity", label: "Employee identity resolved", status: "ok", detail: "No ambiguous matches in current period." }
      : { id: "identity", label: "Employee identity resolved", status: "missing", detail: `${dq.identityAmbiguityWarnings} ambiguous identity matches — resolve before pilot leadership review.` },
  );

  // Provenance
  const classified = dq.measuredInputs + dq.derivedInputs + dq.estimatedInputs + dq.blockedOrUntrustedInputs;
  if (classified === 0) {
    data.push({ id: "provenance", label: "Reliability classification", status: "warn", detail: "Pre-Phase 18A data — provenance not classified. Re-commit to classify." });
  } else if (dq.blockedOrUntrustedInputs > 0) {
    data.push({ id: "provenance", label: "Reliability classification", status: "warn", detail: `${dq.blockedOrUntrustedInputs} untrusted inputs excluded from scoring.` });
  } else {
    data.push({ id: "provenance", label: "Reliability classification", status: "ok", detail: `${dq.measuredInputs} measured / ${dq.derivedInputs} derived / ${dq.estimatedInputs} estimated.` });
  }

  // Periods are usable
  data.push(
    movement.baseline.rpc != null && movement.current.rpc != null
      ? { id: "periods", label: "Baseline and current periods computed", status: "ok", detail: "Both periods produced an RPC." }
      : { id: "periods", label: "Baseline and current periods computed", status: "missing", detail: "One of the periods could not produce RPC — pick wider date ranges." },
  );

  const groups: ChecklistGroup[] = [
    { title: "Pilot setup", items: data },
    { title: "Required data files", items: [...REQUIRED_DATA_FILES, CONTEXTUAL_NOTE] },
  ];

  const all = groups.flatMap((g) => g.items).filter((i) => !i.optional);
  const ok = all.filter((i) => i.status === "ok").length;
  const warn = all.filter((i) => i.status === "warn").length;
  const missing = all.filter((i) => i.status === "missing").length;
  const total = all.length || 1;
  const score = Math.round(((ok + warn * 0.5) / total) * 100);
  const readinessLevel: PilotChecklist["readinessLevel"] =
    missing === 0 && warn <= 1 ? "ready" : missing === 0 ? "almost" : "not_ready";

  return {
    readinessScore: score,
    readinessLevel,
    groups,
    blockingCount: missing,
    warningCount: warn,
  };
}

// ---------- measured uplift (already achieved) ----------

const fmtMoney = (n: number) => `£${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

export function deriveMeasuredUplift(movement: PeriodMovement): MeasuredUplift {
  const improvement: string[] = [];
  const regression: string[] = [];

  const push = (label: string, pct: number | null) => {
    if (pct == null) return;
    const line = `${label}: ${fmtPct(pct)} (baseline → current)`;
    if (pct > 0.5) improvement.push(line);
    else if (pct < -0.5) regression.push(line);
  };
  push("Sales", movement.salesPct);
  push("Revenue per cover", movement.rpcPct);
  push("Revenue per hour", movement.rphPct);

  if (movement.baseLlsDelta != null) {
    const line = `Base LLS: ${movement.baseLlsDelta > 0 ? "+" : ""}${movement.baseLlsDelta.toFixed(2)} (baseline → current)`;
    if (movement.baseLlsDelta > 0.05) improvement.push(line);
    else if (movement.baseLlsDelta < -0.05) regression.push(line);
  }
  if (movement.adjustedLlsDelta != null) {
    const line = `Adjusted LLS (applied v1): ${movement.adjustedLlsDelta > 0 ? "+" : ""}${movement.adjustedLlsDelta.toFixed(2)}`;
    if (movement.adjustedLlsDelta > 0.05) improvement.push(line);
    else if (movement.adjustedLlsDelta < -0.05) regression.push(line);
  }

  return {
    hasImprovement: improvement.length > 0,
    improvementLines: improvement,
    regressionLines: regression,
  };
}

// ---------- modelled opportunity (remaining) ----------

export function deriveModelledOpportunity(report: RoiReport): ModelledOpportunity {
  return {
    modelledRecoverableRevenuePeriod: report.roi.modelledRecoverableRevenue,
    modelledRecoverableRevenueMonthly: report.roi.monthlyModelledRecoverableRevenue,
    recoverabilityFactor: report.roi.assumptions.recoverabilityFactor,
    rpcGap: report.roi.rpcGap,
    coversUsed: report.roi.coversUsed,
    noGap: report.roi.modelledRecoverableRevenue <= 0,
  };
}

// ---------- leadership summary ----------

export interface LeadershipSummaryInput {
  venueName: string;
  baselineLabel: string;
  currentLabel: string;
  report: RoiReport;
  nextAction?: string;
}

export function buildLeadershipSummary(input: LeadershipSummaryInput): string {
  const { venueName, baselineLabel, currentLabel, report } = input;
  const measured = deriveMeasuredUplift(report.movement);
  const modelled = deriveModelledOpportunity(report);

  const dataSources: string[] = ["POS sales (measured)", "Labour cost (measured)"];
  if (!report.dataQuality.hoursMissing) dataSources.push("Labour hours (measured)");
  if (report.dataQuality.identityAmbiguityWarnings === 0) dataSources.push("Resolved employee identity");
  else dataSources.push("Partially resolved employee identity");

  const lines: string[] = [];
  lines.push(`PoppOff pilot leadership summary — ${venueName}`);
  lines.push(`Baseline: ${baselineLabel}`);
  lines.push(`Current:  ${currentLabel}`);
  lines.push("");
  lines.push("What PoppOff measured");
  lines.push(`  Sales, covers, RPC, RPH and LLS across ${report.dataQuality.sampleSizeShifts} shifts in the current period.`);
  lines.push("");
  lines.push("Data sources used");
  for (const s of dataSources) lines.push(`  • ${s}`);
  lines.push("  (Section, rota, reservation and weather data are excluded from scoring unless verified.)");
  lines.push("");
  lines.push("Measured improvement already achieved (baseline → current)");
  if (measured.improvementLines.length === 0 && measured.regressionLines.length === 0) {
    lines.push("  No material movement detected yet between baseline and current.");
  } else {
    for (const l of measured.improvementLines) lines.push(`  ✓ ${l}`);
    for (const l of measured.regressionLines) lines.push(`  ✗ ${l}`);
  }
  lines.push("");
  lines.push("Modelled remaining opportunity (NOT guaranteed revenue)");
  if (modelled.noGap) {
    lines.push("  Current RPC already meets or exceeds baseline RPC — no modelled gap remaining for this period.");
  } else {
    lines.push(
      `  ${fmtMoney(modelled.modelledRecoverableRevenuePeriod)} for the current period (~${fmtMoney(modelled.modelledRecoverableRevenueMonthly)}/month) ` +
      `at the disclosed recoverability factor of ${(modelled.recoverabilityFactor * 100).toFixed(0)}%.`,
    );
    lines.push(`  Derived from an RPC gap of ${fmtMoney(modelled.rpcGap)} across ${modelled.coversUsed.toLocaleString()} covers.`);
  }
  lines.push("");
  lines.push(`Confidence: ${report.confidence.level.toUpperCase()} (${report.confidence.score}/100)`);
  if (report.confidence.reductions.length) {
    lines.push(`  Reductions: ${report.confidence.reductions.join("; ")}.`);
  }
  lines.push("");
  lines.push("Assumptions");
  lines.push(`  • Recoverability factor: ${(modelled.recoverabilityFactor * 100).toFixed(0)}% of the measured RPC gap.`);
  lines.push("  • Adjusted LLS uses the applied v1 opportunity factor. OF v2 is preview only and was not applied.");
  lines.push("  • Monthly figures normalised using 52/12 weeks per month.");
  lines.push("");
  lines.push("Next action");
  lines.push(`  ${input.nextAction ?? "Continue the 30-day PoppOff pilot review rhythm and book the next Revenue Gap Audit."}`);
  return lines.join("\n");
}

// ---------- pilot package orchestrator ----------

export function buildPilotPackage(input: LeadershipSummaryInput): PilotPackage {
  return {
    checklist: evaluateChecklist(input.report.dataQuality, input.report.movement),
    measuredUplift: deriveMeasuredUplift(input.report.movement),
    modelledOpportunity: deriveModelledOpportunity(input.report),
    leadershipSummary: buildLeadershipSummary(input),
  };
}

// ---------- pilot offer framing (static copy) ----------

export const PILOT_OFFER = {
  title: "Revenue Gap Audit + 30-Day PoppOff Pilot",
  venueProvides: [
    "POS sales export for baseline and current periods",
    "Labour hours or timeclock export",
    "Employee / server ID mapping",
    "A single point of contact for the pilot",
  ],
  poppoffAnalyses: [
    "Sales basis, labour basis and identity resolution",
    "Base LLS and Adjusted LLS movement",
    "Server-level performance and coaching priorities",
    "Modelled recoverable revenue at a transparent recoverability factor",
  ],
  managersReceive: [
    "Operations dashboard with reliability and provenance evidence",
    "Weekly priorities and menu intelligence (manager-approved before servers see them)",
    "ROI report with confidence and assumptions",
  ],
  serversSee: [
    "Personal focus areas and momentum rewards",
    "No financial, labour or manager-only intelligence",
  ],
  leadershipReceives: [
    "Boardroom-ready leadership summary",
    "Separation of measured improvement already achieved and modelled remaining opportunity",
    "Confidence breakdown with transparent assumptions",
  ],
  successLooks: [
    "Improved measured RPC or RPH in the current period vs baseline",
    "Reduced modelled remaining opportunity over successive pilot cycles",
    "High data confidence sustained across review cycles",
  ],
} as const;

// ---------- demo journey (sales) ----------

export interface DemoJourneyStep {
  id: string;
  number: number;
  title: string;
  blurb: string;
  href: string;
  category: "problem" | "trust" | "leverage" | "server" | "approval" | "preview" | "outcome" | "pilot";
}

export const DEMO_JOURNEY: DemoJourneyStep[] = [
  { id: "gap", number: 1, title: "Revenue gap problem", blurb: "See where your sales-per-cover and labour-per-hour gap is leaking value.", href: "/calculator/server-gap", category: "problem" },
  { id: "imports", number: 2, title: "Trusted data import", blurb: "Staging, validation, reconciliation and approval before any final write.", href: "/demo/manager", category: "trust" },
  { id: "reliability", number: 3, title: "Data reliability & provenance", blurb: "Every number labelled measured, derived, estimated or contextual.", href: "/demo/manager/reports", category: "trust" },
  { id: "lls", number: 4, title: "LLS & labour leverage", blurb: "Canonical Sum-over-Sum LLS with applied v1 opportunity factor.", href: "/demo/manager", category: "leverage" },
  { id: "server", number: 5, title: "Server performance insight", blurb: "Per-server attribution with identity confidence and basis transparency.", href: "/demo/manager/team", category: "server" },
  { id: "priorities", number: 6, title: "Coaching & priorities", blurb: "Manager approves AI suggestions before they reach servers.", href: "/demo/manager/coaching", category: "approval" },
  { id: "ofv2", number: 7, title: "OF v2 preview", blurb: "Read-only evidence. Adjusted LLS still uses applied v1.", href: "/demo/manager", category: "preview" },
  { id: "roi", number: 8, title: "ROI report", blurb: "Boardroom-ready modelled opportunity with confidence and assumptions.", href: "/demo/manager/reports", category: "outcome" },
  { id: "pilot", number: 9, title: "Pilot next step", blurb: "Revenue Gap Audit + 30-day PoppOff pilot.", href: "/contact", category: "pilot" },
];
