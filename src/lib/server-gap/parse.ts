// Client-side CSV / XLSX parser with fuzzy header detection.
// Header inference is delegated to the shared universal column engine.
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectColumns, type CanonicalField as EngineField } from "@/lib/import/column-intelligence";

// Server-gap calculator only cares about this subset; keep the local type
// stable so call sites don't change.
const FIELD_MAP = {
  server_id: "employee_id",
  server_name: "server_name",
  shift_date: "shift_date",
  shift_start: "shift_start_time",
  shift_end: "shift_end_time",
  net_sales: "net_sales",
  gross_sales: "gross_sales",
  hours: "hours_worked",
  labour_cost: "labor_cost",
  covers: "covers_served",
  section: null,
  role: "job_role",
  venue: "venue",
  daypart: "daypart",
} as const satisfies Record<string, EngineField | null>;

export type CanonicalField = keyof typeof FIELD_MAP;

export function detectHeaders(headers: string[], sampleRows?: Record<string, unknown>[]): Record<string, CanonicalField | null> {
  const needed = Object.values(FIELD_MAP).filter(Boolean) as EngineField[];
  const det = detectColumns(headers, { fields: needed, sampleRows });
  const map: Record<string, CanonicalField | null> = {};
  // Invert: engineField → local key
  const inverted: Partial<Record<EngineField, CanonicalField>> = {};
  for (const [local, eng] of Object.entries(FIELD_MAP)) {
    if (eng) inverted[eng] = local as CanonicalField;
  }
  for (const h of headers) {
    const eng = det.headerToField[h];
    map[h] = eng ? inverted[eng] ?? null : null;
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
