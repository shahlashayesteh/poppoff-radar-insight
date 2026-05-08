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

export async function parseStatsCsv(file: File): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          const rows = (result.data || [])
            .filter((r) => r.server_name && r.server_name.trim() !== "")
            .map<CsvRow>((r) => ({
              server_name: String(r.server_name).trim(),
              total_covers: Number(r.total_covers) || 0,
              total_sales: Number(r.total_sales) || 0,
              wine_sales: Number(r.wine_sales) || 0,
              dessert_sales: Number(r.dessert_sales) || 0,
              cocktail_sales: Number(r.cocktail_sales) || 0,
              sides_sales: Number(r.sides_sales) || 0,
              spirits_sales: Number(r.spirits_sales) || 0,
              sparkling_sales: Number(r.sparkling_sales) || 0,
            }));
          resolve(rows);
        } catch (e) {
          reject(e);
        }
      },
      error: reject,
    });
  });
}
