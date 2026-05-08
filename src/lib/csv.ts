import Papa from "papaparse";

export const CSV_HEADERS = [
  "server_name",
  "total_covers",
  "total_sales",
  "wine_sales",
  "dessert_sales",
  "cocktail_sales",
  "sides_sales",
  "spirits_sales",
  "sparkling_sales",
] as const;

export const CSV_TEMPLATE = `${CSV_HEADERS.join(",")}\nJohn Smith,40,2400,480,240,360,180,120,96\n`;

export function downloadCsvTemplate() {
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

export type CsvRow = {
  server_name: string;
  total_covers: number;
  total_sales: number;
  wine_sales: number;
  dessert_sales: number;
  cocktail_sales: number;
  sides_sales: number;
  spirits_sales: number;
  sparkling_sales: number;
};

const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  servername: "server_name",
  server: "server_name",
  name: "server_name",
  staffname: "server_name",
  waiter: "server_name",
  employeename: "server_name",
  teammember: "server_name",
  totalcovers: "total_covers",
  covers: "total_covers",
  covercount: "total_covers",
  guests: "total_covers",
  totalguests: "total_covers",
  totalsales: "total_sales",
  sales: "total_sales",
  revenue: "total_sales",
  totalrevenue: "total_sales",
  netsales: "total_sales",
  grosssales: "total_sales",
  winesales: "wine_sales",
  wine: "wine_sales",
  dessertsales: "dessert_sales",
  desserts: "dessert_sales",
  dessert: "dessert_sales",
  cocktailsales: "cocktail_sales",
  cocktails: "cocktail_sales",
  cocktail: "cocktail_sales",
  sidessales: "sides_sales",
  sides: "sides_sales",
  side: "sides_sales",
  spiritssales: "spirits_sales",
  spirits: "spirits_sales",
  spirit: "spirits_sales",
  sparklingsales: "sparkling_sales",
  sparkling: "sparkling_sales",
  champagne: "sparkling_sales",
  prosecco: "sparkling_sales",
};

function canonicalHeader(header: string): string {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  return HEADER_ALIASES[normalized] ?? header.trim();
}

function numberFromCsv(value: unknown): number {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  return Number(cleaned) || 0;
}

export async function parseStatsCsv(file: File): Promise<CsvRow[]> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    transformHeader: canonicalHeader,
    skipEmptyLines: true,
  });

  if (result.errors.length) {
    throw new Error(result.errors[0]?.message || "CSV could not be parsed");
  }

  return (result.data || [])
    .filter((r) => r.server_name && r.server_name.trim() !== "")
    .map<CsvRow>((r) => ({
      server_name: String(r.server_name).trim(),
      total_covers: numberFromCsv(r.total_covers),
      total_sales: numberFromCsv(r.total_sales),
      wine_sales: numberFromCsv(r.wine_sales),
      dessert_sales: numberFromCsv(r.dessert_sales),
      cocktail_sales: numberFromCsv(r.cocktail_sales),
      sides_sales: numberFromCsv(r.sides_sales),
      spirits_sales: numberFromCsv(r.spirits_sales),
      sparkling_sales: numberFromCsv(r.sparkling_sales),
    }));
}
