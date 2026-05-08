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
  week_start?: string;
};

type CanonicalField = keyof CsvRow | "date" | "category" | "item" | "quantity" | "check_id";
type RawRow = Record<string, string>;

type Accumulator = CsvRow & { coverCandidates: number[]; checkIds: Set<string>; sumCoverCandidates: boolean };

const HEADER_ALIASES: Record<string, CanonicalField> = {
  servername: "server_name",
  server: "server_name",
  servers: "server_name",
  name: "server_name",
  staff: "server_name",
  staffname: "server_name",
  employeename: "server_name",
  employee: "server_name",
  teammember: "server_name",
  waiter: "server_name",
  waitress: "server_name",
  operator: "server_name",
  cashier: "server_name",
  salesperson: "server_name",
  soldby: "server_name",
  user: "server_name",
  clerk: "server_name",
  totalcovers: "total_covers",
  covers: "total_covers",
  covercount: "total_covers",
  guests: "total_covers",
  guestcount: "total_covers",
  totalguests: "total_covers",
  pax: "total_covers",
  totalpax: "total_covers",
  totalcustomers: "total_covers",
  customers: "total_covers",
  totalrevenue: "total_sales",
  revenue: "total_sales",
  netsales: "total_sales",
  grosssales: "total_sales",
  totalsales: "total_sales",
  sales: "total_sales",
  amount: "total_sales",
  value: "total_sales",
  netamount: "total_sales",
  grossamount: "total_sales",
  linevalue: "total_sales",
  itemvalue: "total_sales",
  subtotal: "total_sales",
  total: "total_sales",
  winesales: "wine_sales",
  wine: "wine_sales",
  dessertsales: "dessert_sales",
  desserts: "dessert_sales",
  dessert: "dessert_sales",
  puddings: "dessert_sales",
  pudding: "dessert_sales",
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
  week: "date",
  weekstart: "date",
  weekstarting: "date",
  weekcommencing: "date",
  date: "date",
  businessdate: "date",
  tradingdate: "date",
  closeddate: "date",
  saledate: "date",
  orderdate: "date",
  category: "category",
  menucategory: "category",
  productcategory: "category",
  department: "category",
  dept: "category",
  group: "category",
  salescategory: "category",
  familygroup: "category",
  item: "item",
  itemname: "item",
  product: "item",
  productname: "item",
  menuname: "item",
  description: "item",
  quantity: "quantity",
  qty: "quantity",
  soldqty: "quantity",
  itemqty: "quantity",
  check: "check_id",
  checkid: "check_id",
  checknumber: "check_id",
  receipt: "check_id",
  receiptid: "check_id",
  orderid: "check_id",
  tabid: "check_id",
  billid: "check_id",
};

const CATEGORY_KEYWORDS: Record<Exclude<keyof CsvRow, "server_name" | "total_covers" | "total_sales" | "week_start">, string[]> = {
  sparkling_sales: ["sparkling", "champagne", "prosecco", "cava", "crémant", "cremant"],
  wine_sales: ["wine", "merlot", "pinot", "rioja", "malbec", "cabernet", "sauvignon", "chardonnay", "rosé", "rose", "riesling", "shiraz", "syrah", "tempranillo", "zinfandel"],
  dessert_sales: ["dessert", "pudding", "sweet", "cake", "ice cream", "gelato", "sorbet", "brownie", "tart", "cheesecake", "chocolate"],
  cocktail_sales: ["cocktail", "martini", "margarita", "mojito", "negroni", "spritz", "daiquiri", "cosmopolitan", "old fashioned", "espresso martini"],
  sides_sales: ["side", "chips", "fries", "potato", "veg", "vegetable", "salad", "bread", "rice", "mash", "onion rings"],
  spirits_sales: ["spirit", "vodka", "gin", "rum", "whisky", "whiskey", "tequila", "brandy", "cognac", "liqueur", "bourbon", "scotch"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalHeader(header: string): string {
  const normalized = normalize(header);
  return HEADER_ALIASES[normalized] ?? header.trim();
}

function numberFromCsv(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw) || raw.endsWith("-");
  const cleaned = raw.replace(/[^0-9.-]/g, "").replace(/-$/, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseDateValue(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const uk = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})/);
  if (uk) {
    const year = Number(uk[3].length === 2 ? `20${uk[3]}` : uk[3]);
    return new Date(year, Number(uk[2]) - 1, Number(uk[1]));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mondayISO(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inferWeekFromFileName(fileName: string) {
  return mondayISO(parseDateValue(fileName) ?? new Date());
}

function looksLikeName(value: unknown) {
  const text = String(value ?? "").trim();
  return /[a-z]/i.test(text) && text.length >= 2 && !parseDateValue(text) && numberFromCsv(text) === 0;
}

function pickFirstHeader(headers: string[], fields: CanonicalField[]) {
  return headers.find((h) => fields.includes(canonicalHeader(h) as CanonicalField));
}

function inferServerHeader(headers: string[], rows: RawRow[]) {
  const exact = pickFirstHeader(headers, ["server_name"]);
  if (exact) return exact;
  return headers.find((h) => {
    const headerText = normalize(h);
    if (["category", "department", "item", "product", "description", "date", "week"].some((x) => headerText.includes(x))) return false;
    const sample = rows.slice(0, 25).map((r) => r[h]).filter(Boolean);
    return sample.length > 0 && sample.filter(looksLikeName).length / sample.length >= 0.65;
  });
}

function inferSalesHeader(headers: string[], rows: RawRow[]) {
  const exact = pickFirstHeader(headers, ["total_sales"]);
  if (exact) return exact;
  const numericHeaders = headers
    .map((h) => ({ h, score: rows.slice(0, 25).filter((r) => Math.abs(numberFromCsv(r[h])) > 0).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return numericHeaders[0]?.h;
}

function categoryBucket(value: unknown): keyof Omit<CsvRow, "server_name" | "total_covers" | "total_sales" | "week_start"> | null {
  const text = String(value ?? "").toLowerCase();
  for (const [bucket, terms] of Object.entries(CATEGORY_KEYWORDS)) {
    if (terms.some((term) => text.includes(term))) return bucket as keyof Omit<CsvRow, "server_name" | "total_covers" | "total_sales" | "week_start">;
  }
  return null;
}

function emptyAccumulator(serverName: string, weekStart: string): Accumulator {
  return {
    server_name: serverName,
    week_start: weekStart,
    total_covers: 0,
    total_sales: 0,
    wine_sales: 0,
    dessert_sales: 0,
    cocktail_sales: 0,
    sides_sales: 0,
    spirits_sales: 0,
    sparkling_sales: 0,
    coverCandidates: [],
    checkIds: new Set<string>(),
    sumCoverCandidates: false,
  };
}

function makeKey(serverName: string, weekStart: string) {
  return `${serverName.trim().toLowerCase()}::${weekStart}`;
}

export async function parseStatsCsv(file: File): Promise<CsvRow[]> {
  const text = await file.text();
  const result = Papa.parse<RawRow>(text, {
    header: true,
    transformHeader: canonicalHeader,
    skipEmptyLines: true,
  });

  if (result.errors.length) {
    throw new Error(result.errors[0]?.message || "CSV could not be parsed");
  }

  const rows = (result.data || []).filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
  if (!rows.length) return [];

  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const serverHeader = inferServerHeader(headers, rows);
  const salesHeader = inferSalesHeader(headers, rows);
  const coversHeader = pickFirstHeader(headers, ["total_covers"]);
  const dateHeader = pickFirstHeader(headers, ["date"]);
  const categoryHeader = pickFirstHeader(headers, ["category"]);
  const itemHeader = pickFirstHeader(headers, ["item"]);
  const checkHeader = pickFirstHeader(headers, ["check_id"]);
  const defaultWeek = inferWeekFromFileName(file.name);

  if (!serverHeader) {
    throw new Error("I couldn't find a server/staff name column in this CSV");
  }

  const grouped = new Map<string, Accumulator>();

  rows.forEach((raw) => {
    const serverName = String(raw[serverHeader] ?? "").trim();
    if (!serverName) return;

    const weekStart = mondayISO(parseDateValue(dateHeader ? raw[dateHeader] : null) ?? parseDateValue(file.name) ?? new Date(defaultWeek));
    const key = makeKey(serverName, weekStart);
    const acc = grouped.get(key) ?? emptyAccumulator(serverName, weekStart);

    const directTotal = numberFromCsv(raw.total_sales ?? (salesHeader ? raw[salesHeader] : 0));
    const rowCategoryText = `${categoryHeader ? raw[categoryHeader] : ""} ${itemHeader ? raw[itemHeader] : ""}`;
    const bucket = categoryBucket(rowCategoryText);
    const hasDirectCategoryColumns = ["wine_sales", "dessert_sales", "cocktail_sales", "sides_sales", "spirits_sales", "sparkling_sales"].some((h) => h in raw);

    if (hasDirectCategoryColumns) {
      acc.total_sales += directTotal;
      acc.wine_sales += numberFromCsv(raw.wine_sales);
      acc.dessert_sales += numberFromCsv(raw.dessert_sales);
      acc.cocktail_sales += numberFromCsv(raw.cocktail_sales);
      acc.sides_sales += numberFromCsv(raw.sides_sales);
      acc.spirits_sales += numberFromCsv(raw.spirits_sales);
      acc.sparkling_sales += numberFromCsv(raw.sparkling_sales);
    } else {
      acc.total_sales += directTotal;
      if (bucket) acc[bucket] += directTotal;
    }

    const covers = numberFromCsv(raw.total_covers ?? (coversHeader ? raw[coversHeader] : 0));
    if (covers > 0) acc.coverCandidates.push(covers);
    if (covers > 0 && (hasDirectCategoryColumns || (!categoryHeader && !itemHeader))) acc.sumCoverCandidates = true;
    if (checkHeader && String(raw[checkHeader] ?? "").trim()) acc.checkIds.add(String(raw[checkHeader]).trim());

    grouped.set(key, acc);
  });

  return Array.from(grouped.values())
    .map(({ coverCandidates, checkIds, sumCoverCandidates, ...row }) => {
      const categoryTotal = row.wine_sales + row.dessert_sales + row.cocktail_sales + row.sides_sales + row.spirits_sales + row.sparkling_sales;
      const total_sales = row.total_sales || categoryTotal;
      const coverTotal = coverCandidates.reduce((sum, value) => sum + value, 0);
      const total_covers = Math.round(sumCoverCandidates ? coverTotal : (checkIds.size || Math.max(0, ...coverCandidates) || row.total_covers || 0));
      return { ...row, total_sales, total_covers };
    })
    .filter((row) => row.server_name && (row.total_sales > 0 || row.total_covers > 0));
}
