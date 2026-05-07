export type CsvRow = {
  server_name: string;
  total_covers: number;
  total_sales: number;
  wine_sales: number;
  dessert_sales: number;
  cocktail_sales: number;
};

const HEADERS = [
  "server_name",
  "total_covers",
  "total_sales",
  "wine_sales",
  "dessert_sales",
  "cocktail_sales",
] as const;

export const CSV_TEMPLATE =
  HEADERS.join(",") + "\n" + "John Smith,40,2400,480,240,360\n";

export function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "poppoff-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') q = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((s) => s.toLowerCase());
  const idx: Record<string, number> = {};
  HEADERS.forEach((h) => { idx[h] = header.indexOf(h); });
  const missing = HEADERS.filter((h) => idx[h] === -1);
  if (missing.length) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const num = (k: string) => Number(cells[idx[k]] ?? 0) || 0;
    rows.push({
      server_name: cells[idx.server_name] ?? "",
      total_covers: num("total_covers"),
      total_sales: num("total_sales"),
      wine_sales: num("wine_sales"),
      dessert_sales: num("dessert_sales"),
      cocktail_sales: num("cocktail_sales"),
    });
  }
  return rows.filter((r) => r.server_name.trim() !== "");
}

export function lastMonday(d = new Date()): string {
  const dt = new Date(d);
  const day = dt.getDay(); // 0 Sun .. 6 Sat
  const offset = (day + 6) % 7; // days since Monday
  dt.setDate(dt.getDate() - offset);
  return dt.toISOString().slice(0, 10);
}

export function isMonday(iso: string): boolean {
  const dt = new Date(iso + "T00:00:00");
  return dt.getDay() === 1;
}
