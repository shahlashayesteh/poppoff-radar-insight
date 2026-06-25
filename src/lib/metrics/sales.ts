import type { MetricResult, SalesBasis } from "./types";
import { nullMetric } from "./types";

export interface SalesInput {
  net_sales?: number | null;
  gross_sales?: number | null;
  discounts?: number | null;
  comps?: number | null;
  voids?: number | null;
  refunds?: number | null;
  // Phase 4: explicit basis & sidecar fields. None of these change canonical
  // formulas — they enable accurate labelling, derivation, and warnings.
  tax?: number | null;
  vat?: number | null;
  service_charge?: number | null;
  tips?: number | null;
  currency?: string | null;
  outlet?: string | null;
  revenue_centre?: string | null;
  /** Explicit override — when an importer / venue setting declares the basis. */
  sales_basis?: SalesBasis | null;
}

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);
const hasNum = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/**
 * Net Sales — preferred uploaded field; fallback = gross − leakage.
 * Phase 4 additions:
 *   - Honours explicit `sales_basis` override when set.
 *   - When ONLY gross_sales exists (no leakage fields), returns
 *     basis="gross_used_as_net_estimate" with a visible WARNING note,
 *     instead of silently treating gross as net.
 */
export function netSales(input: SalesInput): MetricResult<number | null> & { basis: SalesBasis } {
  // Explicit override — uploader / venue setting wins.
  if (input.sales_basis === "net_sales_source" && hasNum(input.net_sales)) {
    return {
      value: input.net_sales,
      basis: "net_sales_source",
      provenance: "uploaded",
      formula: "net_sales (explicit basis override)",
      sourceFields: ["net_sales", "sales_basis"],
    };
  }

  if (hasNum(input.net_sales)) {
    return {
      value: input.net_sales,
      basis: "net_sales_source",
      provenance: "uploaded",
      formula: "net_sales (source field)",
      sourceFields: ["net_sales"],
    };
  }

  if (hasNum(input.gross_sales)) {
    const hasAnyLeakage =
      hasNum(input.discounts) ||
      hasNum(input.comps) ||
      hasNum(input.voids) ||
      hasNum(input.refunds);

    if (hasAnyLeakage) {
      const leakage = n(input.discounts) + n(input.comps) + n(input.voids) + n(input.refunds);
      return {
        value: input.gross_sales - leakage,
        basis: "net_sales_derived",
        provenance: "derived",
        formula: "gross_sales − discounts − comps − voids − refunds",
        sourceFields: ["gross_sales", "discounts", "comps", "voids", "refunds"].filter(
          (k) => (input as Record<string, unknown>)[k] != null,
        ),
        notes: ["Derived net sales — tax / service-charge treatment may vary"],
      };
    }

    // Only gross — flag as estimate, do NOT silently treat as net.
    return {
      value: input.gross_sales,
      basis: "gross_used_as_net_estimate",
      provenance: "estimated",
      formula: "gross_sales (no leakage data — used as net estimate)",
      sourceFields: ["gross_sales"],
      notes: [
        "Gross used as net estimate — no discounts / comps / voids / refunds uploaded. Figure is directional only.",
      ],
    };
  }

  return { ...nullMetric("net_sales unavailable"), basis: "unknown" };
}

export function grossSales(input: SalesInput): MetricResult<number | null> & { basis: SalesBasis } {
  if (hasNum(input.gross_sales)) {
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

/**
 * Aggregate sales basis across a set of rows.
 * Returns "mixed" if rows span more than one materially different basis.
 * Manager UI MUST surface a mixed-basis warning when this returns "mixed".
 */
export function aggregateSalesBasis(bases: Array<SalesBasis | null | undefined>): SalesBasis {
  const seen = new Set<SalesBasis>();
  for (const b of bases) {
    if (!b || b === "unknown") continue;
    seen.add(b);
  }
  if (seen.size === 0) return "unknown";
  if (seen.size === 1) return [...seen][0];
  // net source + net derived are both "net" semantically → not mixed.
  const all = [...seen];
  const isAllNetFamily = all.every(
    (b) => b === "net_sales_source" || b === "net_sales_derived",
  );
  if (isAllNetFamily) return "net_sales_derived";
  return "mixed";
}
