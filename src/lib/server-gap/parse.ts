// Client-side CSV / XLSX parser with fuzzy header detection.
import Papa from "papaparse";
import * as XLSX from "xlsx";

const ALIASES = {
  server_id: ["server_id", "serverid", "employee_id", "emp_id", "staff_id", "id"],
  server_name: [
    "server_name",
    "server",
    "employee",
    "employee_name",
    "staff",
    "staff_name",
    "name",
    "waiter",
  ],
  shift_date: ["shift_date", "date", "business_date", "service_date", "day"],
  shift_start: ["shift_start", "start_time", "start", "clock_in", "in_time", "from"],
  shift_end: ["shift_end", "end_time", "end", "clock_out", "out_time", "to"],
  net_sales: ["net_sales", "net", "sales_net"],
  gross_sales: ["gross_sales", "gross", "sales", "total_sales", "revenue", "amount"],
  hours: ["hours", "hrs", "hours_worked", "worked_hours", "labour_hours", "labor_hours"],
  labour_cost: ["labour_cost", "labor_cost", "wage_cost", "cost", "payroll"],
  covers: ["covers", "guests", "guest_count", "pax", "cover_count"],
  section: ["section", "station", "zone", "area"],
  role: ["role", "position", "job"],
  venue: ["venue", "site", "location", "store", "restaurant"],
  daypart: ["daypart", "meal_period", "service", "shift_type", "period"],
} as const;

export type CanonicalField = keyof typeof ALIASES;

function normHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function detectHeaders(headers: string[]): Record<string, CanonicalField | null> {
  const map: Record<string, CanonicalField | null> = {};
  for (const h of headers) {
    const norm = normHeader(h);
    let hit: CanonicalField | null = null;
    for (const [canon, alts] of Object.entries(ALIASES)) {
      if ((alts as readonly string[]).includes(norm)) {
        hit = canon as CanonicalField;
        break;
      }
    }
    map[h] = hit;
  }
  return map;
}

export type RawRow = Record<string, unknown>;

export type ParsedRow = Partial<Record<CanonicalField, unknown>> & {
  _rowIndex: number;
  _raw: RawRow;
};

export type ParseResult = {
  rows: ParsedRow[];
  rawHeaders: string[];
  headerMap: Record<string, CanonicalField | null>;
  detected: Set<CanonicalField>;
};

function toParsedRow(raw: RawRow, headerMap: Record<string, CanonicalField | null>, idx: number): ParsedRow {
  const out: ParsedRow = { _rowIndex: idx, _raw: raw };
  for (const [h, canon] of Object.entries(headerMap)) {
    if (!canon) continue;
    const v = raw[h];
    if (v === undefined || v === null || v === "") continue;
    (out as Record<string, unknown>)[canon] = v;
  }
  return out;
}

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseCSV(file);
  }
  return parseXLSX(file);
}

function finalize(rawHeaders: string[], rows: RawRow[]): ParseResult {
  const headerMap = detectHeaders(rawHeaders);
  const detected = new Set<CanonicalField>();
  for (const v of Object.values(headerMap)) if (v) detected.add(v);
  return {
    rawHeaders,
    headerMap,
    detected,
    rows: rows.map((r, i) => toParsedRow(r, headerMap, i)),
  };
}

function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        resolve(finalize(headers, res.data));
      },
      error: (err) => reject(err),
    });
  });
}

async function parseXLSX(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return finalize(headers, rows);
}

/** Coerce a sales field to number. Strips currency symbols, thousands separators. */
export function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** Canonical YYYY-MM-DD key for a date-ish input. */
export function dateKey(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(+v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    const a = +m[1];
    const b = +m[2];
    // assume DD/MM/YYYY
    const day = a > 12 ? a : a;
    const mon = a > 12 ? b : b;
    // if first segment > 12, it must be a day
    const dd = a > 12 ? a : a; // (kept symmetric — UK default)
    return `${y}-${String(mon).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const t = new Date(s);
  if (!isNaN(+t)) return dateKey(t);
  return null;
}
