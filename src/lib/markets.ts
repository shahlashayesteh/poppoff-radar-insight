// ============================================================================
// Market presets (Phase F.1)
// ----------------------------------------------------------------------------
// Calculator-only market readiness for UK, US, and Croatia / EUR.
// Do NOT use these for the manager LLS engine math; they only control
// currency labels, default date format, and the employer on-cost ASSUMPTION
// shown to the user.
//
// Wording rule: this is NOT a "Euro tax" preset. The Euro is just a currency.
// Croatia is one country; do not generalise to "Eurozone" because employer
// payroll on-costs differ by country.
// ============================================================================

export type MarketId = "UK" | "US" | "HR";

export type DateFormatCode = "uk" | "us"; // HR uses uk-style DD/MM

export type MarketPreset = {
  id: MarketId;
  label: string;          // UI label, e.g. "UK (£)"
  shortLabel: string;     // tab/pill label
  currencySymbol: "£" | "$" | "€";
  currencyCode: "GBP" | "USD" | "EUR";
  dateFormat: DateFormatCode;
  /** Default employer on-cost ASSUMPTION (modelling, not a payroll calc). */
  defaultOnCost: number;
  /** Short label for the on-cost field. */
  onCostLabel: string;
  /** Long helper text explaining the assumption. */
  onCostHelper: string;
  /** Footer/wage hint shown beside the wage input. */
  wageHint: string;
  /** Free-form benchmark blurb shown on FLC. */
  benchmarkBlurb: (floorLabourPct: number) => string;
};

export const MARKETS: Record<MarketId, MarketPreset> = {
  UK: {
    id: "UK",
    label: "UK (£)",
    shortLabel: "UK",
    currencySymbol: "£",
    currencyCode: "GBP",
    dateFormat: "uk",
    defaultOnCost: 0.15,
    onCostLabel: "Approx. UK employer on-cost / employer NI assumption",
    onCostHelper:
      "This is a modelling assumption, not a full payroll tax calculator. Real UK employer costs can vary by threshold, allowance, employment type, and payroll circumstances.",
    wageHint: "Base wage before NI, pension and tronc.",
    benchmarkBlurb: () =>
      "UK hospitality labour typically runs 30–35% of revenue; front-of-house runs higher than the US because servers earn full minimum wage, not a tipped rate.",
  },
  US: {
    id: "US",
    label: "US ($)",
    shortLabel: "US",
    currencySymbol: "$",
    currencyCode: "USD",
    dateFormat: "us",
    defaultOnCost: 0.12,
    onCostLabel: "Approx. US payroll burden assumption",
    onCostHelper:
      "This is an operational payroll burden estimate, not federal payroll tax only. Actual employer cost can vary by state, unemployment insurance, workers' compensation, benefits, and payroll circumstances.",
    wageHint: "Base wage before payroll taxes and benefits.",
    benchmarkBlurb: (pct) =>
      `Full-service front-of-house labour commonly runs 8–12% of sales in tipped-wage states. In no-tip-credit states (CA, WA, OR, NV and others) servers earn full minimum wage, so floor labour runs higher — often 14–16%. Yours is ${pct.toFixed(1)}%.`,
  },
  HR: {
    id: "HR",
    label: "Croatia (€)",
    shortLabel: "Croatia / EUR",
    currencySymbol: "€",
    currencyCode: "EUR",
    dateFormat: "uk",
    defaultOnCost: 0.165,
    onCostLabel: "Croatia employer health insurance contribution assumption",
    onCostHelper:
      "Croatia preset uses EUR and a 16.5% employer contribution assumption. Enter the venue's actual gross hourly rate or upload the venue's labour export if available.",
    wageHint:
      "Enter actual gross hourly rate. No minimum-wage default is applied — figures stay editable.",
    benchmarkBlurb: () =>
      "Croatia hospitality labour ratios vary widely by region, season and venue type. Use your actual gross hourly rate or upload the venue's labour export for an accurate figure.",
  },
};

export const MARKET_ORDER: MarketId[] = ["UK", "US", "HR"];

/**
 * Loaded labour cost (FIX F.1 — single canonical formula).
 *
 *   loaded = grossHourlyRate × hours × (1 + onCost)
 *
 * DOUBLE-COUNTING PROTECTION: when `basis === "fully_loaded"` the inputs
 * already include employer on-costs; on-cost is NOT applied again.
 */
export type LabourCostBasis = "gross_hourly" | "fully_loaded";

export function loadedLabourCost(opts: {
  rate: number;
  hours: number;
  onCost: number;
  basis: LabourCostBasis;
}): number {
  const { rate, hours, onCost, basis } = opts;
  const base = rate * hours;
  if (basis === "fully_loaded") return base; // already loaded — do not double-count
  return base * (1 + onCost);
}

/** Format a number with the preset's currency symbol. */
export function formatMoney(
  market: MarketId,
  value: number,
  opts: { decimals?: 0 | 2 } = {},
): string {
  const dec = opts.decimals ?? 0;
  const nf = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return `${MARKETS[market].currencySymbol}${nf.format(dec === 0 ? Math.round(value) : value)}`;
}
