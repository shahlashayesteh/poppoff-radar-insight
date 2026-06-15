// Data-quality warnings.

import type { ShiftMetric } from "./calc";
import type { AmbiguousRow, NormalisedLabourRow, NormalisedSalesRow, UnmatchedLabour, UnmatchedSales } from "./merge";

export type Warning = {
  level: "info" | "warn" | "error";
  message: string;
};

export function buildWarnings(input: {
  salesRowsTotal: number;
  labourRowsTotal: number;
  salesRejected: { rowIndex: number; reason: string }[];
  labourRejected: { rowIndex: number; reason: string }[];
  ambiguous: AmbiguousRow[];
  unmatchedSales: UnmatchedSales[];
  unmatchedLabour: UnmatchedLabour[];
  shifts: ShiftMetric[];
  salesDetected: Set<string>;
  labourDetected: Set<string>;
  hasSalesStartTimes: boolean;
}): Warning[] {
  const out: Warning[] = [];
  const {
    salesRowsTotal,
    labourRowsTotal,
    salesRejected,
    labourRejected,
    ambiguous,
    unmatchedSales,
    unmatchedLabour,
    shifts,
    hasSalesStartTimes,
  } = input;

  if (salesRejected.length) {
    out.push({
      level: "warn",
      message: `${salesRejected.length} of ${salesRowsTotal} sales rows skipped (missing required fields).`,
    });
  }
  if (labourRejected.length) {
    out.push({
      level: "warn",
      message: `${labourRejected.length} of ${labourRowsTotal} labour rows skipped (missing required fields).`,
    });
  }
  if (ambiguous.length) {
    out.push({
      level: "warn",
      message: `${ambiguous.length} sales row(s) flagged ambiguous — sales export has no start time and the server has multiple labour shifts that day. Excluded from calculation.`,
    });
  }
  if (unmatchedSales.length) {
    out.push({
      level: "warn",
      message: `${unmatchedSales.length} sales row(s) had no matching labour shift.`,
    });
  }
  if (unmatchedLabour.length) {
    out.push({
      level: "info",
      message: `${unmatchedLabour.length} labour row(s) had no matching sales — likely non-server roles or off-floor time.`,
    });
  }
  const defaulted = shifts.filter((s) => s.factorDefaulted).length;
  if (defaulted) {
    out.push({
      level: "warn",
      message: `${defaulted} shift(s) defaulted to Opportunity Factor 1.0 (times missing or unusable).`,
    });
  }
  const estimated = shifts.filter((s) => s.factorEstimated).length;
  if (estimated) {
    out.push({
      level: "info",
      message: `${estimated} shift(s) had only one of start/end time — assumed a 4-hour window.`,
    });
  }
  if (!hasSalesStartTimes) {
    out.push({
      level: "info",
      message: "Sales export has no start-time column. Matched by server + date when only one labour shift existed that day.",
    });
  }
  if (!shifts.length) {
    out.push({
      level: "error",
      message: "No shifts matched. Check that server identifiers and dates align between the two files.",
    });
  }
  return out;
}
