// Phase 6 — Pure, deterministic per-row validation for imports.
// No DB, no I/O. Pure so it is fully unit-testable.
//
// Rules (locked by Phase 6 spec):
//   REJECT: no server_name AND no server_id  |  no shift_date
//   WARN:   missing start_time  |  missing outlet  |  missing revenue_centre
//           gross-only (net_sales missing)  |  unknown labour basis  |  unknown sales basis
//   FLAG:   duplicate (same server+date+start)
//
// Never silently:
//   - default missing start_time to 00:00:00 (warned; defaulting happens only at commit)
//   - merge ambiguous employees
//   - treat gross as clean net
//   - aggregate mixed labour basis without flagging

export type SourceKind = "sales" | "labor";

export type RawImportRow = {
  server_name?: string | null;
  server_id?: string | null;
  shift_date?: string | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  daypart?: string | null;
  covers_served?: number | null;
  gross_sales?: number | null;
  net_sales?: number | null;
  labor_cost?: number | null;
  outlet?: string | null;
  revenue_centre?: string | null;
  sales_basis?: string | null;
  labor_basis?: string | null;
};

export type ValidatedRow = {
  index: number;
  status: "accepted" | "rejected" | "warning";
  reasons: string[];
  evidence: Record<string, unknown>;
  duplicateOfIndex?: number;
};

export type ValidationSummary = {
  accepted: number;
  rejected: number;
  warnings: number;
  duplicates: number;
  missingStartTime: number;
  missingOutlet: number;
  missingRevenueCentre: number;
  grossOnlyRows: number;
  unknownSalesBasis: number;
  unknownLaborBasis: number;
};

export type Totals = {
  gross_total: number | null;
  net_total: number | null;
  labour_total: number | null;
  covers_total: number | null;
};

export type BasisSummary = {
  // counts per detected basis label, plus a top-level "mode": single | mixed | unknown
  mode: "single" | "mixed" | "unknown";
  counts: Record<string, number>;
};

export type ValidationResult = {
  rows: ValidatedRow[];
  summary: ValidationSummary;
  totals: Totals;
  salesBasis: BasisSummary;
  labourBasis: BasisSummary;
};

function trimOrNull(s: unknown): string | null {
  if (s == null) return null;
  const v = String(s).trim();
  return v.length === 0 ? null : v;
}

function numOrNull(n: unknown): number | null {
  if (n == null || n === "") return null;
  const v = typeof n === "number" ? n : Number(String(n).replace(/[, $£€]/g, ""));
  return Number.isFinite(v) ? v : null;
}

function dupKey(r: RawImportRow, sourceKind: SourceKind): string {
  const sid = trimOrNull(r.server_id);
  const name = trimOrNull(r.server_name);
  const start = trimOrNull(r.shift_start_time);
  // When start_time is missing (common in POS sales exports that aggregate per
  // server per day), the legacy key (identity|date|"") collapsed multiple real
  // shifts on the same date into "duplicates". Use a per-row signature
  // (amount/hours, end-time, covers) as a tiebreaker so legitimate multi-shift
  // days aren't false-flagged. Identical rows (true duplicates) still collide.
  const tiebreak = start
    ? ""
    : sourceKind === "sales"
      ? [
          numOrNull(r.gross_sales) ?? "",
          numOrNull(r.net_sales) ?? "",
          numOrNull(r.covers_served) ?? "",
          trimOrNull(r.shift_end_time) ?? "",
          trimOrNull(r.daypart) ?? "",
        ].join(":")
      : [
          numOrNull(r.labor_cost) ?? "",
          trimOrNull(r.shift_end_time) ?? "",
          trimOrNull(r.daypart) ?? "",
        ].join(":");
  return [sourceKind, sid ?? name ?? "", r.shift_date ?? "", start ?? "", tiebreak].join("|").toLowerCase();
}

function inferBasis(mode: SourceKind, _r: RawImportRow, declared: string | null): { basis: string; known: boolean } {
  if (declared) return { basis: declared.toLowerCase(), known: true };
  return { basis: "unknown", known: false };
}

/**
 * Per-batch defaults declared once by the manager (or auto-inferred at staging time).
 * When a default is present, a per-row warning about the same missing context is suppressed
 * — the value is treated as known from batch context. Real data problems (duplicates,
 * missing identity, bad dates) are NEVER suppressed by defaults.
 */
export type BatchDefaults = {
  outlet?: string | null;
  revenue_centre?: string | null;
  sales_basis?: string | null;   // 'net' | 'gross' | 'gross_with_tax'
  labour_basis?: string | null;  // 'wages_only' | 'wages_plus_oncosts' | 'fully_loaded'
};

export function validateRows(
  rows: RawImportRow[],
  sourceKind: SourceKind,
  defaults: BatchDefaults = {},
): ValidationResult {
  const dOutlet = trimOrNull(defaults.outlet);
  const dRC = trimOrNull(defaults.revenue_centre);
  const dSalesBasis = trimOrNull(defaults.sales_basis);
  const dLabourBasis = trimOrNull(defaults.labour_basis);
  const out: ValidatedRow[] = [];
  const seen = new Map<string, number>();
  let accepted = 0, rejected = 0, warnings = 0, duplicates = 0;
  let missingStartTime = 0, missingOutlet = 0, missingRevenueCentre = 0;
  let grossOnlyRows = 0, unknownSalesBasis = 0, unknownLaborBasis = 0;

  let gross = 0, net = 0, labour = 0, covers = 0;
  let hasGross = false, hasNet = false, hasLabour = false, hasCovers = false;

  const salesCounts: Record<string, number> = {};
  const labourCounts: Record<string, number> = {};

  rows.forEach((r, i) => {
    const reasons: string[] = [];
    const evidence: Record<string, unknown> = {};
    let status: ValidatedRow["status"] = "accepted";

    const name = trimOrNull(r.server_name);
    const sid = trimOrNull(r.server_id);
    const date = trimOrNull(r.shift_date);

    // REJECT rules
    if (!name && !sid) { reasons.push("missing_server_identity"); status = "rejected"; }
    if (!date)         { reasons.push("missing_shift_date");      status = "rejected"; }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      reasons.push("invalid_shift_date_format"); status = "rejected";
    }

    if (status !== "rejected") {
      // WARN rules
      if (!trimOrNull(r.shift_start_time)) {
        reasons.push("missing_start_time"); missingStartTime++; status = "warning";
      }
      if (!trimOrNull(r.outlet) && !dOutlet) {
        reasons.push("missing_outlet"); missingOutlet++; status = status === "accepted" ? "warning" : status;
      }
      if (!trimOrNull(r.revenue_centre) && !dRC) {
        reasons.push("missing_revenue_centre"); missingRevenueCentre++;
        status = status === "accepted" ? "warning" : status;
      }

      if (sourceKind === "sales") {
        const g = numOrNull(r.gross_sales);
        const n = numOrNull(r.net_sales);
        // Only warn gross-only when there is no batch-level sales basis declaring how to treat it.
        if (g != null && n == null && !dSalesBasis) {
          reasons.push("gross_only_no_net"); grossOnlyRows++;
          status = status === "accepted" ? "warning" : status;
          evidence.sales_basis_hint = "gross_used_as_net_estimate";
        }
        const declared = trimOrNull(r.sales_basis) ?? dSalesBasis;
        const sb = inferBasis("sales", r, declared);
        if (!sb.known) {
          reasons.push("unknown_sales_basis"); unknownSalesBasis++;
          status = status === "accepted" ? "warning" : status;
        }
        salesCounts[sb.basis] = (salesCounts[sb.basis] ?? 0) + 1;

        if (g != null) { gross += g; hasGross = true; }
        if (n != null) { net   += n; hasNet   = true; }
        const c = numOrNull(r.covers_served);
        if (c != null) { covers += c; hasCovers = true; }
      } else {
        const declared = trimOrNull(r.labor_basis) ?? dLabourBasis;
        const lb = inferBasis("labor", r, declared);
        if (!lb.known) {
          reasons.push("unknown_labor_basis"); unknownLaborBasis++;
          status = status === "accepted" ? "warning" : status;
        }
        labourCounts[lb.basis] = (labourCounts[lb.basis] ?? 0) + 1;
        const l = numOrNull(r.labor_cost);
        if (l != null) { labour += l; hasLabour = true; }
      }

      // Duplicate detection (within this batch)
      const key = dupKey(r);
      if (seen.has(key)) {
        const firstIdx = seen.get(key)!;
        reasons.push("duplicate_row"); duplicates++;
        status = status === "accepted" ? "warning" : status;
        out.push({ index: i, status, reasons, evidence, duplicateOfIndex: firstIdx });
        if (status === "warning") warnings++;
        else if (status === "accepted") accepted++;
        return;
      } else {
        seen.set(key, i);
      }
    }

    if (status === "rejected") rejected++;
    else if (status === "warning") warnings++;
    else accepted++;

    out.push({ index: i, status, reasons, evidence });
  });

  const basisMode = (counts: Record<string, number>): BasisSummary["mode"] => {
    const keys = Object.keys(counts);
    if (keys.length === 0) return "unknown";
    const known = keys.filter((k) => k !== "unknown");
    if (known.length === 0) return "unknown";
    if (known.length === 1 && (counts.unknown ?? 0) === 0) return "single";
    return "mixed";
  };

  return {
    rows: out,
    summary: {
      accepted, rejected, warnings, duplicates,
      missingStartTime, missingOutlet, missingRevenueCentre,
      grossOnlyRows, unknownSalesBasis, unknownLaborBasis,
    },
    totals: {
      gross_total:  hasGross  ? gross  : null,
      net_total:    hasNet    ? net    : null,
      labour_total: hasLabour ? labour : null,
      covers_total: hasCovers ? covers : null,
    },
    salesBasis:  { mode: basisMode(salesCounts),  counts: salesCounts },
    labourBasis: { mode: basisMode(labourCounts), counts: labourCounts },
  };
}
