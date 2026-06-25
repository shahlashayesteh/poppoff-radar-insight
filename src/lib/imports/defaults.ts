// Per-batch defaults inference. Pure: no DB, no I/O.
//
// Used at staging time to pre-fill the batch_defaults record so that managers
// uploading minimal CSVs from any POS system don't see "every row warned"
// noise about missing optional context columns (outlet, revenue_centre,
// sales_basis, labour_basis).
//
// Inference is conservative — it only fills a default when there is a clear
// filename or column-shape signal. The manager can always override on the
// batch detail page.

import type { BatchDefaults } from "./validation";
import type { RawImportRow, SourceKind } from "./validation";

export type DefaultsContext = {
  /** Active venue name — used as the outlet default for single-site venues. */
  venueName?: string | null;
  /** Whether the user's venue is single-site. If unknown, treat as true (safer for typical SMB customers). */
  singleSite?: boolean;
  /** Original filename, lower-cased for matching. */
  filename?: string | null;
  /** Optional vendor hint from import wizard (e.g. "toast", "square"). */
  sourceSystem?: string | null;
};

export type InferredDefaults = {
  defaults: BatchDefaults;
  /** Plain-English reasons for each inference, for the upload toast. */
  reasons: string[];
};

const NET_HINTS = /\b(net[_-]?sales|netrevenue|subtotal|netsale|net\b)/i;
const GROSS_HINTS = /\b(gross[_-]?sales|gross|grosssale)\b/i;
const GROSS_TAX_HINTS = /\b(with[_-]?tax|incl[_-]?tax|inctax|tax[_-]?incl)\b/i;
const WAGE_ONLY_HINTS = /\b(wage|wages|payroll|base|gross[_-]?pay)\b/i;
const FULLY_LOADED_HINTS = /\b(fully[_-]?loaded|loaded|burdened|total[_-]?cost|on[_-]?cost|oncost)\b/i;

export function inferBatchDefaults(
  rows: RawImportRow[],
  sourceKind: SourceKind,
  ctx: DefaultsContext,
): InferredDefaults {
  const defaults: BatchDefaults = {};
  const reasons: string[] = [];

  const fn = (ctx.filename ?? "").toLowerCase();
  const src = (ctx.sourceSystem ?? "").toLowerCase();

  // Outlet: only default when venue is single-site AND no row carries an outlet.
  const anyOutlet = rows.some((r) => (r.outlet ?? "").toString().trim() !== "");
  if (!anyOutlet && (ctx.singleSite ?? true) && ctx.venueName) {
    defaults.outlet = ctx.venueName;
    reasons.push(`outlet = "${ctx.venueName}" (single-site default)`);
  }

  // Sales basis inference (only for sales files).
  if (sourceKind === "sales") {
    const anyDeclared = rows.some((r) => (r.sales_basis ?? "").toString().trim() !== "");
    const hasGross = rows.some((r) => r.gross_sales != null);
    const hasNet = rows.some((r) => r.net_sales != null);
    if (!anyDeclared) {
      if (GROSS_TAX_HINTS.test(fn)) {
        defaults.sales_basis = "gross_with_tax";
        reasons.push(`sales basis = gross_with_tax (filename hint)`);
      } else if (NET_HINTS.test(fn) || hasNet) {
        defaults.sales_basis = "net";
        reasons.push(`sales basis = net (${hasNet ? "net_sales column present" : "filename hint"})`);
      } else if (GROSS_HINTS.test(fn) || (hasGross && !hasNet)) {
        defaults.sales_basis = "gross";
        reasons.push(`sales basis = gross (only gross_sales present)`);
      }
    }
  }

  // Labour basis inference (only for labour files).
  if (sourceKind === "labor") {
    const anyDeclared = rows.some((r) => (r.labor_basis ?? "").toString().trim() !== "");
    if (!anyDeclared) {
      if (FULLY_LOADED_HINTS.test(fn) || FULLY_LOADED_HINTS.test(src)) {
        defaults.labour_basis = "fully_loaded";
        reasons.push(`labour basis = fully_loaded (filename hint)`);
      } else if (WAGE_ONLY_HINTS.test(fn) || WAGE_ONLY_HINTS.test(src)) {
        defaults.labour_basis = "wages_only";
        reasons.push(`labour basis = wages_only (filename hint)`);
      }
    }
  }

  return { defaults, reasons };
}

/** Allowed values for the manager-facing dropdowns on the batch page. */
export const SALES_BASIS_OPTIONS = ["net", "gross", "gross_with_tax"] as const;
export const LABOUR_BASIS_OPTIONS = ["wages_only", "wages_plus_oncosts", "fully_loaded"] as const;
