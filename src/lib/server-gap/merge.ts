// Merge logic — four-tier priority with ambiguous-row flagging.

import { dateKey, toNumber, type ParsedRow } from "./parse";
import { normId, normName, serverKey, serverDisplay } from "./identity";
import { parseTime } from "./opportunity";

export type SalesBasis = "net" | "gross";

export type NormalisedSalesRow = {
  rowIndex: number;
  key: string;
  display: string;
  date: string;
  startMin: number | null;
  endMin: number | null;
  netSales: number | null;
  grossSales: number | null;
  raw: ParsedRow;
};

export type NormalisedLabourRow = {
  rowIndex: number;
  key: string;
  display: string;
  date: string;
  startMin: number;
  endMin: number | null;
  hours: number;
  labourCost: number | null;
  raw: ParsedRow;
};

function hoursFromTimes(s: number | null, e: number | null): number | null {
  if (s == null || e == null) return null;
  const end = e <= s ? e + 24 * 60 : e;
  return (end - s) / 60;
}

export function normaliseSales(rows: ParsedRow[]): {
  rows: NormalisedSalesRow[];
  rejected: { rowIndex: number; reason: string }[];
} {
  const out: NormalisedSalesRow[] = [];
  const rejected: { rowIndex: number; reason: string }[] = [];
  for (const r of rows) {
    const id = normId(r.server_id as string | undefined);
    const name = normName(r.server_name as string | undefined);
    const date = dateKey(r.shift_date);
    const net = toNumber(r.net_sales);
    const gross = toNumber(r.gross_sales);
    if (!id && !name) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing server name and ID" });
      continue;
    }
    if (!date) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing or unreadable date" });
      continue;
    }
    if (net == null && gross == null) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing sales (net and gross)" });
      continue;
    }
    out.push({
      rowIndex: r._rowIndex,
      key: serverKey({ id, name }),
      display: serverDisplay({ id, name: String(r.server_name ?? "") }),
      date,
      startMin: parseTime(r.shift_start as string | number | undefined),
      endMin: parseTime(r.shift_end as string | number | undefined),
      netSales: net,
      grossSales: gross,
      raw: r,
    });
  }
  return { rows: out, rejected };
}

export function normaliseLabour(rows: ParsedRow[]): {
  rows: NormalisedLabourRow[];
  rejected: { rowIndex: number; reason: string }[];
} {
  const out: NormalisedLabourRow[] = [];
  const rejected: { rowIndex: number; reason: string }[] = [];
  for (const r of rows) {
    const id = normId(r.server_id as string | undefined);
    const name = normName(r.server_name as string | undefined);
    const date = dateKey(r.shift_date);
    const start = parseTime(r.shift_start as string | number | undefined);
    const end = parseTime(r.shift_end as string | number | undefined);
    const hoursDirect = toNumber(r.hours);
    const hours = hoursDirect ?? hoursFromTimes(start, end);
    if (!id && !name) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing server name and ID" });
      continue;
    }
    if (!date) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing or unreadable date" });
      continue;
    }
    if (start == null) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing shift start time" });
      continue;
    }
    if (hours == null || hours <= 0) {
      rejected.push({ rowIndex: r._rowIndex, reason: "Missing or zero hours" });
      continue;
    }
    out.push({
      rowIndex: r._rowIndex,
      key: serverKey({ id, name }),
      display: serverDisplay({ id, name: String(r.server_name ?? "") }),
      date,
      startMin: start,
      endMin: end,
      hours,
      labourCost: toNumber(r.labour_cost),
      raw: r,
    });
  }
  return { rows: out, rejected };
}

export type MatchedShift = {
  key: string;
  display: string;
  date: string;
  startMin: number;
  endMin: number | null;
  hours: number;
  sales: number;
  salesBasis: SalesBasis;
  labourCost: number | null;
  matchTier: 1 | 2 | 3 | 4 | 5;
};

export type AmbiguousRow = {
  salesRowIndex: number;
  key: string;
  display: string;
  date: string;
  candidateLabourRows: number[];
};

export type UnmatchedSales = {
  salesRowIndex: number;
  key: string;
  display: string;
  date: string;
};

export type UnmatchedLabour = {
  labourRowIndex: number;
  key: string;
  display: string;
  date: string;
};

const OVERLAP_TOLERANCE_MIN = 15;

function overlaps(salesStart: number, labStart: number, labEnd: number | null): boolean {
  if (labEnd == null) {
    return Math.abs(salesStart - labStart) <= OVERLAP_TOLERANCE_MIN;
  }
  const ls = labStart - OVERLAP_TOLERANCE_MIN;
  const le = (labEnd <= labStart ? labEnd + 24 * 60 : labEnd) + OVERLAP_TOLERANCE_MIN;
  const s = salesStart < ls ? salesStart + 24 * 60 : salesStart;
  return s >= ls && s <= le;
}

export function mergeRows(
  sales: NormalisedSalesRow[],
  labour: NormalisedLabourRow[],
  basis: SalesBasis,
): {
  matched: MatchedShift[];
  ambiguous: AmbiguousRow[];
  unmatchedSales: UnmatchedSales[];
  unmatchedLabour: UnmatchedLabour[];
} {
  // Index labour by key+date
  const labByKeyDate = new Map<string, NormalisedLabourRow[]>();
  for (const l of labour) {
    const k = `${l.key}|${l.date}`;
    const arr = labByKeyDate.get(k);
    if (arr) arr.push(l);
    else labByKeyDate.set(k, [l]);
  }

  const usedLabour = new Set<number>();
  const matched: MatchedShift[] = [];
  const ambiguous: AmbiguousRow[] = [];
  const unmatchedSales: UnmatchedSales[] = [];

  for (const s of sales) {
    const sales$ = basis === "net" ? s.netSales ?? s.grossSales : s.grossSales ?? s.netSales;
    if (sales$ == null) continue;

    const candidates = labByKeyDate.get(`${s.key}|${s.date}`) ?? [];
    if (candidates.length === 0) {
      unmatchedSales.push({
        salesRowIndex: s.rowIndex,
        key: s.key,
        display: s.display,
        date: s.date,
      });
      continue;
    }

    let pick: { lab: NormalisedLabourRow; tier: 1 | 2 | 3 | 4 | 5 } | null = null;

    // Tiers 1+3 (id) vs 2+4 (name) are encoded in the key itself (id: vs nm:).
    // Tier 1/2: exact start time
    if (s.startMin != null) {
      for (const l of candidates) {
        if (usedLabour.has(l.rowIndex)) continue;
        if (l.startMin === s.startMin) {
          const tier: 1 | 2 = s.key.startsWith("id:") ? 1 : 2;
          pick = { lab: l, tier };
          break;
        }
      }
    }

    // Tier 3/4: overlapping window
    if (!pick && s.startMin != null) {
      for (const l of candidates) {
        if (usedLabour.has(l.rowIndex)) continue;
        if (overlaps(s.startMin, l.startMin, l.endMin)) {
          const tier: 3 | 4 = s.key.startsWith("id:") ? 3 : 4;
          pick = { lab: l, tier };
          break;
        }
      }
    }

    // Tier 5: no sales start time → match only if exactly one labour shift that day
    if (!pick && s.startMin == null) {
      const available = candidates.filter((l) => !usedLabour.has(l.rowIndex));
      if (available.length === 1) {
        pick = { lab: available[0], tier: 5 };
      } else if (available.length > 1) {
        ambiguous.push({
          salesRowIndex: s.rowIndex,
          key: s.key,
          display: s.display,
          date: s.date,
          candidateLabourRows: available.map((l) => l.rowIndex),
        });
        continue;
      }
    }

    if (!pick) {
      unmatchedSales.push({
        salesRowIndex: s.rowIndex,
        key: s.key,
        display: s.display,
        date: s.date,
      });
      continue;
    }

    usedLabour.add(pick.lab.rowIndex);
    matched.push({
      key: s.key,
      display: s.display || pick.lab.display,
      date: s.date,
      startMin: (s.startMin ?? pick.lab.startMin) as number,
      endMin: s.endMin ?? pick.lab.endMin,
      hours: pick.lab.hours as number,
      sales: sales$,
      salesBasis: basis,
      labourCost: pick.lab.labourCost,
      matchTier: pick.tier,
    });
  }

  const unmatchedLabour: UnmatchedLabour[] = labour
    .filter((l) => !usedLabour.has(l.rowIndex))
    .map((l) => ({
      labourRowIndex: l.rowIndex,
      key: l.key,
      display: l.display,
      date: l.date,
    }));

  return { matched, ambiguous, unmatchedSales, unmatchedLabour };
}
