// Data-confidence score.

import type { ShiftMetric } from "./calc";
import type { AmbiguousRow, UnmatchedSales } from "./merge";

export type Confidence = {
  level: "High" | "Medium" | "Low";
  matchRate: number;
  defaultedRate: number;
  ambiguousCount: number;
  driver: string;
};

export function computeConfidence(input: {
  salesAccepted: number;
  matchedShifts: ShiftMetric[];
  ambiguous: AmbiguousRow[];
  unmatchedSales: UnmatchedSales[];
}): Confidence {
  const { salesAccepted, matchedShifts, ambiguous, unmatchedSales } = input;
  const total = Math.max(1, salesAccepted);
  const matchRate = matchedShifts.length / total;
  const defaulted = matchedShifts.filter((s) => s.factorDefaulted).length;
  const defaultedRate = matchedShifts.length ? defaulted / matchedShifts.length : 0;
  const ambiguousCount = ambiguous.length;

  let level: Confidence["level"];
  let driver = "";

  if (matchRate >= 0.9 && defaultedRate < 0.1 && ambiguousCount === 0) {
    level = "High";
    driver = `${Math.round(matchRate * 100)}% of sales rows matched cleanly.`;
  } else if (matchRate < 0.75 || defaultedRate > 0.25 || ambiguousCount > matchedShifts.length * 0.1) {
    level = "Low";
    if (matchRate < 0.75) driver = `Only ${Math.round(matchRate * 100)}% of sales rows matched a labour shift.`;
    else if (defaultedRate > 0.25) driver = `${Math.round(defaultedRate * 100)}% of shifts defaulted to Opportunity Factor 1.0.`;
    else driver = `${ambiguousCount} ambiguous row(s) excluded from calculation.`;
  } else {
    level = "Medium";
    if (unmatchedSales.length) driver = `${unmatchedSales.length} sales row(s) unmatched.`;
    else if (defaulted) driver = `${defaulted} shift(s) used a default Opportunity Factor.`;
    else if (ambiguousCount) driver = `${ambiguousCount} ambiguous row(s) excluded.`;
    else driver = "Some rows had partial data.";
  }

  return { level, matchRate, defaultedRate, ambiguousCount, driver };
}
