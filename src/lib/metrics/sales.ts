import type { MetricResult, SalesBasis } from "./types";
import { nullMetric } from "./types";

export interface SalesInput {
  net_sales?: number | null;
  gross_sales?: number | null;
  discounts?: number | null;
  comps?: number | null;
  voids?: number | null;
  refunds?: number | null;
}

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

/**
 * Net Sales — preferred uploaded field; fallback = gross − leakage.
 * Per canonical rule: preserve provenance and basis.
 */
export function netSales(input: SalesInput): MetricResult<number | null> & { basis: SalesBasis } {
  if (typeof input.net_sales === "number" && isFinite(input.net_sales)) {
    return {
      value: input.net_sales,
      basis: "net_sales_source",
      provenance: "uploaded",
      formula: "net_sales (source field)",
      sourceFields: ["net_sales"],
    };
  }
  if (typeof input.gross_sales === "number" && isFinite(input.gross_sales)) {
    const leakage = n(input.discounts) + n(input.comps) + n(input.voids) + n(input.refunds);
    return {
      value: input.gross_sales - leakage,
      basis: "net_sales_derived",
      provenance: "derived",
      formula: "gross_sales − discounts − comps − voids − refunds",
      sourceFields: ["gross_sales", "discounts", "comps", "voids", "refunds"].filter(
        (k) => (input as Record<string, unknown>)[k] != null,
      ),
      notes: ["Derived net sales — tax treatment may vary"],
    };
  }
  return { ...nullMetric("net_sales unavailable"), basis: "unknown" };
}

export function grossSales(input: SalesInput): MetricResult<number | null> & { basis: SalesBasis } {
  if (typeof input.gross_sales === "number" && isFinite(input.gross_sales)) {
    return {
      value: input.gross_sales,
      basis: "gross_sales_source",
      provenance: "uploaded",
      formula: "gross_sales (source field)",
      sourceFields: ["gross_sales"],
    };
  }
  return { ...nullMetric("gross_sales unavailable"), basis: "unknown" };
}

export function leakageAmount(input: SalesInput): MetricResult<number> {
  const value = n(input.discounts) + n(input.comps) + n(input.voids) + n(input.refunds);
  return {
    value,
    provenance: "derived",
    formula: "discounts + comps + voids + refunds",
    sourceFields: ["discounts", "comps", "voids", "refunds"],
  };
}

export function leakageRate(input: SalesInput): MetricResult<number | null> {
  const leak = leakageAmount(input).value;
  const gross = input.gross_sales;
  if (typeof gross !== "number" || !isFinite(gross) || gross <= 0) {
    return nullMetric("leakage / gross_sales (denominator missing)");
  }
  return {
    value: leak / gross,
    provenance: "derived",
    formula: "(discounts + comps + voids + refunds) / gross_sales",
    sourceFields: ["discounts", "comps", "voids", "refunds", "gross_sales"],
  };
}
