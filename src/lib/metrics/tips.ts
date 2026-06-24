import { netSales, type SalesInput } from "./sales";
import type { MetricResult } from "./types";
import { nullMetric } from "./types";

export interface TipsInput extends SalesInput {
  tips?: number | null;
  service_charge?: number | null;
  eligible_sales?: number | null;
}

const isPos = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0;

export function tipPct(input: TipsInput): MetricResult<number | null> {
  if (!isPos(input.tips)) return nullMetric("tips / eligible_sales");
  if (isPos(input.eligible_sales)) {
    return {
      value: input.tips / input.eligible_sales,
      provenance: "derived",
      formula: "tips / eligible_sales",
      sourceFields: ["tips", "eligible_sales"],
    };
  }
  const net = netSales(input);
  if (net.value == null || net.value <= 0)
    return nullMetric("tips / net_sales (fallback)", ["tips", ...net.sourceFields]);
  return {
    value: input.tips / net.value,
    provenance: "derived",
    formula: "tips / net_sales (fallback — eligible_sales unavailable)",
    sourceFields: ["tips", ...net.sourceFields],
    notes: ["Approximate — eligible_sales denominator unavailable"],
  };
}

export function serviceChargePct(input: TipsInput): MetricResult<number | null> {
  if (!isPos(input.service_charge)) return nullMetric("service_charge / eligible_sales");
  if (isPos(input.eligible_sales)) {
    return {
      value: input.service_charge / input.eligible_sales,
      provenance: "derived",
      formula: "service_charge / eligible_sales",
      sourceFields: ["service_charge", "eligible_sales"],
    };
  }
  const net = netSales(input);
  if (net.value == null || net.value <= 0) return nullMetric("service_charge / net_sales");
  return {
    value: input.service_charge / net.value,
    provenance: "derived",
    formula: "service_charge / net_sales (fallback — eligible_sales unavailable)",
    sourceFields: ["service_charge", ...net.sourceFields],
    notes: ["Approximate — eligible_sales denominator unavailable"],
  };
}

/**
 * Generic attach rate. Caller passes numerator + chosen denominator.
 * If `denominator_basis` is unknown/estimated, returns notes accordingly.
 */
export function attachRate(opts: {
  numerator: number | null | undefined;
  denominator: number | null | undefined;
  numeratorName: string;
  denominatorName: string;
  approximate?: boolean;
}): MetricResult<number | null> {
  if (
    typeof opts.numerator !== "number" ||
    typeof opts.denominator !== "number" ||
    !isFinite(opts.numerator) ||
    !isFinite(opts.denominator) ||
    opts.denominator <= 0
  ) {
    return nullMetric(`${opts.numeratorName} / ${opts.denominatorName}`);
  }
  return {
    value: opts.numerator / opts.denominator,
    provenance: "derived",
    formula: `${opts.numeratorName} / ${opts.denominatorName}`,
    sourceFields: [opts.numeratorName, opts.denominatorName],
    notes: opts.approximate
      ? [`Approximate — true eligibility denominator unavailable`]
      : undefined,
  };
}
