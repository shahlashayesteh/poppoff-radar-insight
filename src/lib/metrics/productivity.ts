import { hoursWorked, laborCost, type LaborInput } from "./labor";
import { netSales, type SalesInput } from "./sales";
import type { MetricResult } from "./types";
import { nullMetric } from "./types";

const isPos = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0;

export interface ShiftInput extends SalesInput, LaborInput {
  covers?: number | null;
  closed_checks?: number | null;
  items_sold?: number | null;
}

export function rph(input: ShiftInput): MetricResult<number | null> {
  const net = netSales(input);
  const h = hoursWorked(input);
  if (net.value == null || !isPos(h.value))
    return nullMetric("net_sales / hours_worked", [...net.sourceFields, ...h.sourceFields]);
  return {
    value: net.value / h.value,
    provenance: "derived",
    formula: "net_sales / hours_worked",
    sourceFields: [...net.sourceFields, ...h.sourceFields],
    basis: `${net.basis} / ${h.basis}`,
  };
}

/** Sales per hour — alias of rph for UIs that prefer SPH naming. */
export const sph = rph;

export function rpc(input: ShiftInput): MetricResult<number | null> {
  const net = netSales(input);
  if (net.value == null || !isPos(input.covers))
    return nullMetric("net_sales / covers", [...net.sourceFields, "covers"]);
  return {
    value: net.value / input.covers,
    provenance: "derived",
    formula: "net_sales / covers",
    sourceFields: [...net.sourceFields, "covers"],
    basis: net.basis,
  };
}

export function avgCheck(input: ShiftInput): MetricResult<number | null> {
  const net = netSales(input);
  if (net.value == null || !isPos(input.closed_checks))
    return nullMetric("net_sales / closed_checks", [...net.sourceFields, "closed_checks"]);
  return {
    value: net.value / input.closed_checks,
    provenance: "derived",
    formula: "net_sales / closed_checks",
    sourceFields: [...net.sourceFields, "closed_checks"],
    basis: net.basis,
  };
}

export function coversPerHour(input: ShiftInput): MetricResult<number | null> {
  const h = hoursWorked(input);
  if (!isPos(input.covers) || !isPos(h.value))
    return nullMetric("covers / hours_worked", ["covers", ...h.sourceFields]);
  return {
    value: input.covers / h.value,
    provenance: "derived",
    formula: "covers / hours_worked",
    sourceFields: ["covers", ...h.sourceFields],
    basis: h.basis,
  };
}

export function itemsPerCover(input: ShiftInput): MetricResult<number | null> {
  if (!isPos(input.items_sold) || !isPos(input.covers))
    return nullMetric("items_sold / covers", ["items_sold", "covers"]);
  return {
    value: input.items_sold / input.covers,
    provenance: "derived",
    formula: "items_sold / covers",
    sourceFields: ["items_sold", "covers"],
  };
}

export function laborPct(input: ShiftInput): MetricResult<number | null> {
  const lc = laborCost(input);
  const net = netSales(input);
  if (lc.value == null || net.value == null || net.value <= 0)
    return nullMetric("labor_cost / net_sales", [...lc.sourceFields, ...net.sourceFields]);
  return {
    value: lc.value / net.value,
    provenance: "derived",
    formula: "labor_cost / net_sales",
    sourceFields: [...lc.sourceFields, ...net.sourceFields],
    basis: `${lc.basis} / ${net.basis}`,
  };
}
