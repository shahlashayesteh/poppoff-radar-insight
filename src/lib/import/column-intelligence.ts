// Universal hospitality column intelligence engine.
//
// One shared engine used by every CSV/XLSX importer in PoppOff. Given a list
// of raw headers (and optionally sample rows), it returns:
//   - the best canonical field for each header
//   - the best header for each requested canonical field
//   - a confidence band (high / medium / low) per mapping
//   - a detected file kind (sales / labor / menu / guest_check / employee / outlet)
//   - data-pattern warnings
//
// The engine is intentionally aggressive about substring + token matching so
// real exports like `FullyLoadedLabourCostEURDemo`, `Net Sales (GBP)`,
// `EmployeeID_DEMO` or `Shift Start Time` map without manual confirmation.
//
// IMPORTANT: this module is pure, has no side effects, and never touches the
// DOM, network, or supabase. Every importer in src/lib/** and src/routes/**
// MUST funnel header-mapping decisions through here — do not re-implement
// header guessing per page.

export type CanonicalField =
  // Identity
  | "employee_id"
  | "server_name"
  | "job_role"
  // Time
  | "shift_date"
  | "shift_start_time"
  | "shift_end_time"
  | "check_open_time"
  | "check_close_time"
  | "daypart"
  | "week_start"
  // Location
  | "outlet"
  | "revenue_centre"
  | "venue"
  // Sales
  | "gross_sales"
  | "net_sales"
  | "food_sales"
  | "beverage_sales"
  // Volume
  | "covers_served"
  | "checks"
  | "items_sold"
  // Labour
  | "hours_worked"
  | "scheduled_hours"
  | "hourly_rate"
  | "labor_cost"
  | "fully_loaded_labor_cost"
  // Performance (rarely in raw files, but recognised)
  | "sales_per_hour"
  | "revenue_per_cover"
  | "average_check"
  | "labor_percentage"
  // Adjustments
  | "discount"
  | "comp"
  | "void"
  | "refund"
  // Tips & service
  | "tips"
  | "service_charge"
  // Payment
  | "payment_method"
  | "payment_total"
  // Menu
  | "menu_item"
  | "item_id"
  | "category"
  | "major_group"
  | "quantity"
  | "unit_price"
  | "item_revenue"
  // Check identifier
  | "check_id";

export type ConfidenceBand = "high" | "medium" | "low";

export type FieldMapping = {
  field: CanonicalField;
  header: string;
  /** 0..1 raw score from the matcher. */
  score: number;
  confidence: ConfidenceBand;
  /** Other candidates with non-trivial scores, useful for the review panel. */
  alternates: { header: string; score: number }[];
  /** Pattern check on sample data (if provided). null = not checked. */
  validation: "ok" | "warn" | "fail" | null;
  reason: string;
};

export type DetectionResult = {
  /** keyed by canonical field */
  mappings: Partial<Record<CanonicalField, FieldMapping>>;
  /** keyed by raw header — what we think it is, with low-score noise dropped */
  headerToField: Record<string, CanonicalField | null>;
  fileKind: FileKind;
  fileKindConfidence: ConfidenceBand;
  warnings: string[];
};

export type FileKind =
  | "pos_sales"
  | "labor_rota"
  | "menu_item_sales"
  | "guest_check"
  | "employee_master"
  | "outlet_master"
  | "unknown";

// ---------------------------------------------------------------------------
// Header normalisation
// ---------------------------------------------------------------------------

/** Currency suffixes / prefixes commonly tacked on by demos and exports. */
const CURRENCY_TOKENS = new Set([
  "gbp", "usd", "eur", "aud", "cad", "chf", "jpy", "nzd", "zar", "aed", "sek",
  "nok", "dkk", "mxn", "brl", "sgd", "hkd", "inr", "pln", "czk", "huf", "ron",
  "£", "$", "€", "¥",
]);

/** Generic suffixes that should never block matching. */
const NOISE_TOKENS = new Set([
  "demo", "demo1", "demo2", "test", "sample",
  "export", "exported", "exports",
  "report", "reports", "reporting",
  "v1", "v2", "v3", "v4", "v5",
  "total", "value", "amount", "amt",
  "raw", "src", "src1",
]);

/** Spelling normalisation: British → American + common abbreviations. */
const SPELLING_MAP: Record<string, string> = {
  labour: "labor",
  labours: "labor",
  centre: "center",
  centres: "center",
  cheque: "check",
  cheques: "checks",
  organisation: "organization",
  rota: "schedule",
  rosters: "schedule",
  roster: "schedule",
  rvc: "revenuecenter",
  sph: "salesperhour",
  rph: "revenueperhour",
  apc: "averagepercover",
  atv: "averagetransactionvalue",
  aov: "averageordervalue",
  gmv: "grosssales",
};

/** Tokenise a header into lowercase word atoms after stripping noise. */
export function tokenizeHeader(raw: string): string[] {
  if (!raw) return [];
  let s = String(raw).toLowerCase();
  // strip parenthetical content like "(GBP)" / "[demo]"
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  // currency symbols → space
  s = s.replace(/[£$€¥]/g, " ");
  // split on non-alphanumeric AND on camelCase boundaries
  s = s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = s.split(/\s+/).filter(Boolean);
  // expand spellings, drop noise + currency
  const out: string[] = [];
  for (const t of tokens) {
    if (CURRENCY_TOKENS.has(t)) continue;
    if (NOISE_TOKENS.has(t)) continue;
    const mapped = SPELLING_MAP[t] ?? t;
    // SPELLING_MAP may yield compound; resplit
    if (mapped !== t) {
      out.push(...mapped.split(/(?=[a-z])(?<=[a-z])/).filter(Boolean));
      out.push(mapped);
    } else {
      out.push(t);
    }
  }
  return out;
}

/** Single normalised string (tokens joined). Lossy but stable. */
export function normalizeHeader(raw: string): string {
  return tokenizeHeader(raw).join("");
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

type FieldDef = {
  field: CanonicalField;
  /** Tokens that, when ALL present, strongly indicate this field. */
  required?: string[][];
  /** Any-of token groups; presence of any group element boosts. */
  any?: string[];
  /** Boost when these tokens co-occur. */
  boosters?: string[];
  /** Tokens that disqualify (e.g. "scheduled" disqualifies "actual hours"). */
  blockers?: string[];
  /** Penalty when these tokens are present (soft blockers). */
  penalties?: string[];
  /** Direct exact-match shortcuts on the normalised header. */
  exact?: string[];
  /** Pattern validator (run on sample values). */
  pattern?: "number" | "positive_number" | "integer" | "date" | "time" | "text" | "categorical";
};

const FIELDS: FieldDef[] = [
  // ----- Identity -----
  {
    field: "employee_id",
    exact: ["employeeid", "empid", "staffid", "payrollid", "workerid", "serverid", "userid", "teammemberid"],
    required: [["employee", "id"], ["staff", "id"], ["payroll", "id"], ["worker", "id"], ["server", "id"], ["team", "member", "id"]],
    any: ["empid", "personnel"],
    pattern: "categorical",
  },
  {
    field: "server_name",
    exact: ["servername", "employeename", "staffname", "waitername", "name"],
    required: [["server", "name"], ["employee", "name"], ["staff", "name"], ["waiter", "name"], ["team", "member", "name"]],
    any: ["server", "employee", "staff", "waiter", "waitress", "operator", "cashier", "name", "salesperson", "soldby", "user", "clerk", "teammember"],
    boosters: ["full"],
    blockers: ["id", "code"],
    pattern: "text",
  },
  {
    field: "job_role",
    exact: ["jobrole", "jobtitle", "position", "role", "title"],
    any: ["role", "position", "job", "title"],
    blockers: ["name", "id"],
    pattern: "categorical",
  },

  // ----- Time -----
  {
    field: "shift_date",
    exact: ["shiftdate", "businessdate", "tradingdate", "workdate", "servicedate", "date"],
    required: [["shift", "date"], ["business", "date"], ["trading", "date"], ["work", "date"], ["service", "date"], ["sale", "date"], ["order", "date"], ["close", "date"], ["transaction", "date"]],
    any: ["date", "day"],
    blockers: ["time", "start", "end", "open", "close"],
    pattern: "date",
  },
  {
    field: "shift_start_time",
    exact: ["shiftstart", "starttime", "clockin", "intime", "timein", "actualstart", "start"],
    required: [["shift", "start"], ["clock", "in"], ["start", "time"], ["actual", "start"], ["scheduled", "start"], ["in", "time"], ["time", "in"]],
    any: ["start", "clockin", "intime"],
    blockers: ["end", "out"],
    pattern: "time",
  },
  {
    field: "shift_end_time",
    exact: ["shiftend", "endtime", "clockout", "outtime", "timeout", "actualend", "end"],
    required: [["shift", "end"], ["clock", "out"], ["end", "time"], ["actual", "end"], ["scheduled", "end"], ["out", "time"], ["time", "out"]],
    any: ["end", "clockout", "outtime"],
    blockers: ["start", "in"],
    pattern: "time",
  },
  {
    field: "check_open_time",
    required: [["check", "open"], ["open", "time"]],
    pattern: "time",
  },
  {
    field: "check_close_time",
    required: [["check", "close"], ["close", "time"]],
    pattern: "time",
  },
  {
    field: "daypart",
    exact: ["daypart", "mealperiod", "serviceperiod", "service", "period", "session"],
    any: ["daypart", "meal", "service", "period", "session"],
    blockers: ["start", "end", "hours", "cost", "sales"],
    pattern: "categorical",
  },
  {
    field: "week_start",
    exact: ["weekstart", "weekcommencing", "weekstarting", "weekending"],
    required: [["week", "start"], ["week", "commencing"], ["week", "ending"]],
    pattern: "date",
  },

  // ----- Location -----
  {
    field: "outlet",
    exact: ["outlet", "outletname", "site", "venue", "store", "restaurant", "unit", "location", "department"],
    any: ["outlet", "site", "restaurant", "venue", "unit"],
    blockers: ["id", "code"],
    pattern: "categorical",
  },
  {
    field: "revenue_centre",
    exact: ["revenuecenter", "revenuecentre", "rvc", "costcenter", "costcentre"],
    required: [["revenue", "center"], ["cost", "center"]],
    any: ["rvc", "revenuecenter"],
    pattern: "categorical",
  },
  {
    field: "venue",
    exact: ["venue", "venuename"],
    required: [["venue", "name"]],
    pattern: "categorical",
  },

  // ----- Sales -----
  {
    field: "gross_sales",
    exact: ["grosssales", "grossrevenue", "gross", "totalsales", "salestotal", "sales", "revenue", "turnover", "gmv"],
    required: [["gross", "sales"], ["gross", "revenue"], ["total", "sales"], ["sales", "total"]],
    any: ["gross", "sales", "revenue", "turnover"],
    boosters: ["total"],
    blockers: ["net", "cost", "wage", "labor", "labour", "tip", "service", "tax", "discount", "comp", "void", "refund"],
    pattern: "positive_number",
  },
  {
    field: "net_sales",
    exact: ["netsales", "netrevenue", "net", "salesnet", "salesexcludingtax", "salesexcltax"],
    required: [["net", "sales"], ["net", "revenue"], ["sales", "ex", "tax"], ["sales", "excluding", "tax"]],
    any: ["net"],
    boosters: ["sales", "revenue"],
    blockers: ["gross", "cost", "wage", "labor", "labour", "tip", "service"],
    pattern: "positive_number",
  },
  {
    field: "food_sales",
    required: [["food", "sales"], ["food", "revenue"]],
    any: ["food"],
    boosters: ["sales", "revenue"],
    blockers: ["cost", "labor", "labour"],
    pattern: "positive_number",
  },
  {
    field: "beverage_sales",
    required: [["beverage", "sales"], ["drink", "sales"], ["bev", "sales"]],
    any: ["beverage", "drinks", "bev"],
    boosters: ["sales", "revenue"],
    blockers: ["cost"],
    pattern: "positive_number",
  },

  // ----- Volume -----
  {
    field: "covers_served",
    exact: ["covers", "coversserved", "guests", "guestcount", "pax", "diners", "customers"],
    required: [["covers", "served"], ["guest", "count"], ["total", "covers"], ["total", "guests"]],
    any: ["covers", "guests", "pax", "diners", "customers"],
    blockers: ["sales", "revenue", "cost", "hour", "rate", "tip"],
    pattern: "integer",
  },
  {
    field: "checks",
    exact: ["checks", "checkcount", "bills", "orders", "transactions"],
    required: [["check", "count"], ["bill", "count"], ["transaction", "count"]],
    any: ["checks", "bills", "orders", "transactions"],
    blockers: ["sales", "revenue", "open", "close", "id", "number", "time"],
    pattern: "integer",
  },
  {
    field: "items_sold",
    required: [["items", "sold"], ["quantity", "sold"], ["item", "qty"]],
    any: ["qty", "quantity"],
    blockers: ["sales", "price", "revenue"],
    pattern: "integer",
  },

  // ----- Labour -----
  {
    field: "hours_worked",
    exact: ["hours", "hoursworked", "workedhours", "actualhours", "paidhours", "totalhours", "laborhours"],
    required: [["hours", "worked"], ["worked", "hours"], ["actual", "hours"], ["paid", "hours"], ["labor", "hours"]],
    any: ["hours", "hrs"],
    blockers: ["scheduled", "rate", "cost", "overtime"],
    pattern: "positive_number",
  },
  {
    field: "scheduled_hours",
    required: [["scheduled", "hours"], ["rostered", "hours"], ["forecast", "hours"], ["planned", "hours"]],
    any: ["scheduled", "rostered", "forecast"],
    boosters: ["hours"],
    pattern: "positive_number",
  },
  {
    field: "hourly_rate",
    exact: ["hourlyrate", "wagerate", "rate", "hourlypay", "payrate"],
    required: [["hourly", "rate"], ["hourly", "pay"], ["wage", "rate"], ["pay", "rate"]],
    any: ["rate"],
    boosters: ["hourly", "wage", "pay"],
    blockers: ["cost", "total", "hours", "tax"],
    pattern: "positive_number",
  },
  {
    field: "labor_cost",
    exact: ["laborcost", "laborcost", "wagecost", "wages", "payrollcost", "payroll", "staffcost", "employmentcost"],
    required: [
      ["labor", "cost"], ["wage", "cost"], ["payroll", "cost"], ["staff", "cost"],
      ["employment", "cost"], ["employee", "cost"], ["total", "pay"], ["gross", "pay"], ["wages"],
    ],
    any: ["labor", "wage", "wages", "payroll", "pay"],
    boosters: ["cost", "total"],
    blockers: ["rate", "hours", "tip", "service", "fullyloaded", "loaded"],
    pattern: "positive_number",
  },
  {
    field: "fully_loaded_labor_cost",
    exact: ["fullyloadedlaborcost", "fullyloadedlabor", "fullyloadedcost", "totalemploymentcost", "loadedlaborcost"],
    required: [
      ["fully", "loaded", "labor"],
      ["fully", "loaded", "cost"],
      ["fully", "loaded"],
      ["total", "employment", "cost"],
      ["loaded", "labor", "cost"],
      ["with", "oncost"],
      ["incl", "oncost"],
    ],
    any: ["loaded", "oncost"],
    boosters: ["labor", "cost", "employment"],
    pattern: "positive_number",
  },

  // ----- Performance -----
  {
    field: "sales_per_hour",
    exact: ["sph", "salesperhour", "revenueperhour", "rph"],
    required: [["sales", "per", "hour"], ["revenue", "per", "hour"]],
    pattern: "positive_number",
  },
  {
    field: "revenue_per_cover",
    exact: ["averagepercover", "apc", "revenuepercover", "spendpercover", "averagespend"],
    required: [["per", "cover"], ["per", "guest"]],
    pattern: "positive_number",
  },
  {
    field: "average_check",
    exact: ["averagecheck", "averagebill", "averageorder", "averagetransaction", "atv", "aov"],
    required: [["average", "check"], ["average", "bill"], ["average", "order"], ["average", "transaction"]],
    pattern: "positive_number",
  },
  {
    field: "labor_percentage",
    exact: ["laborpercentage", "laborpct", "labor"],
    required: [["labor", "percentage"], ["labor", "pct"], ["labor", "ratio"]],
    pattern: "number",
  },

  // ----- Adjustments -----
  { field: "discount", exact: ["discount", "discounts", "discountamount"], any: ["discount"], pattern: "number" },
  { field: "comp", exact: ["comp", "comps", "compamount"], any: ["comp", "comps"], pattern: "number" },
  { field: "void", exact: ["void", "voids", "voidamount"], any: ["void", "voids"], pattern: "number" },
  { field: "refund", exact: ["refund", "refunds", "refundamount"], any: ["refund", "refunds"], pattern: "number" },

  // ----- Tips & service -----
  { field: "tips", exact: ["tips", "tip", "gratuity", "gratuities", "cashtips", "cardtips"], any: ["tip", "tips", "gratuity"], pattern: "number" },
  { field: "service_charge", exact: ["servicecharge", "service", "discretionaryservice"], required: [["service", "charge"]], pattern: "number" },

  // ----- Payment -----
  { field: "payment_method", exact: ["paymentmethod", "tendertype", "tender", "paymenttype"], required: [["payment", "method"], ["tender", "type"]], pattern: "categorical" },
  { field: "payment_total", exact: ["paymenttotal", "paid", "amountpaid"], required: [["payment", "total"], ["amount", "paid"]], pattern: "positive_number" },

  // ----- Menu -----
  { field: "menu_item", exact: ["menuitem", "itemname", "item", "product", "productname", "menuname", "description"], required: [["menu", "item"], ["item", "name"], ["product", "name"]], any: ["item", "product"], blockers: ["id", "qty", "quantity", "price", "category", "group"], pattern: "categorical" },
  { field: "item_id", exact: ["itemid", "sku", "plu", "productid", "menuid"], required: [["item", "id"], ["product", "id"]], pattern: "categorical" },
  { field: "category", exact: ["category", "menucategory", "productcategory", "subcategory"], any: ["category"], blockers: ["id"], pattern: "categorical" },
  { field: "major_group", exact: ["majorgroup", "familygroup", "productgroup", "salesgroup"], required: [["major", "group"], ["family", "group"], ["product", "group"]], pattern: "categorical" },
  { field: "quantity", exact: ["quantity", "qty", "soldqty", "itemqty", "units"], any: ["qty", "quantity"], blockers: ["sales", "revenue", "price"], pattern: "integer" },
  { field: "unit_price", exact: ["unitprice", "price"], required: [["unit", "price"]], blockers: ["total", "sales"], pattern: "positive_number" },
  { field: "item_revenue", required: [["item", "revenue"], ["item", "sales"], ["line", "value"], ["line", "total"]], pattern: "positive_number" },

  // ----- Check id -----
  { field: "check_id", exact: ["checkid", "checknumber", "receipt", "receiptid", "orderid", "tabid", "billid"], required: [["check", "id"], ["check", "number"], ["receipt", "id"], ["order", "id"]], any: ["receipt"], pattern: "categorical" },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreField(headerTokens: string[], normalized: string, def: FieldDef): number {
  if (!headerTokens.length) return 0;
  const tokenSet = new Set(headerTokens);
  let score = 0;

  // Exact normalised match — strongest signal.
  if (def.exact?.includes(normalized)) score = Math.max(score, 0.95);

  // Required token groups: all tokens in any group present.
  for (const group of def.required ?? []) {
    if (group.every((t) => tokenSet.has(t))) {
      score = Math.max(score, 0.85);
    }
  }

  // Any-of bag of words.
  if (def.any?.some((t) => tokenSet.has(t))) {
    score = Math.max(score, 0.55);
  }

  // Boosters: each matching booster adds a small bump (capped).
  let boost = 0;
  for (const b of def.boosters ?? []) if (tokenSet.has(b)) boost += 0.06;
  score = Math.min(0.99, score + Math.min(0.15, boost));

  // Blockers fully disqualify (UNLESS we matched an exact synonym, since exact
  // synonyms like `fullyloadedlaborcost` legitimately contain "loaded").
  if (score < 0.9) {
    for (const b of def.blockers ?? []) if (tokenSet.has(b)) return 0;
  }

  // Soft penalties.
  for (const p of def.penalties ?? []) if (tokenSet.has(p)) score -= 0.15;

  return Math.max(0, score);
}

// ---------------------------------------------------------------------------
// Data pattern validation
// ---------------------------------------------------------------------------

function isNumberLike(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (typeof v === "number") return Number.isFinite(v);
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  return cleaned.length > 0 && Number.isFinite(parseFloat(cleaned));
}
function isPositiveNumber(v: unknown): boolean {
  if (!isNumberLike(v)) return false;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return n >= 0;
}
function isInteger(v: unknown): boolean {
  if (!isNumberLike(v)) return false;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-6;
}
function isDateLike(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (v instanceof Date) return !Number.isNaN(+v);
  const s = String(v).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(s)) return true;
  // Excel serial date in plausible range
  if (typeof v === "number" && v > 20000 && v < 80000) return true;
  return !Number.isNaN(+new Date(s));
}
function isTimeLike(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (typeof v === "number" && v >= 0 && v < 1.0001) return true;
  return /\d{1,2}:\d{2}/.test(String(v));
}
function isTextLike(v: unknown): boolean {
  if (v == null || v === "") return false;
  const s = String(v).trim();
  return s.length >= 1 && /[a-zA-Z]/.test(s) && !isDateLike(s);
}

function validateSample(
  pattern: FieldDef["pattern"],
  samples: unknown[],
): "ok" | "warn" | "fail" | null {
  if (!pattern || !samples.length) return null;
  const nonEmpty = samples.filter((v) => v != null && v !== "");
  if (!nonEmpty.length) return null;
  let pass = 0;
  for (const v of nonEmpty) {
    switch (pattern) {
      case "number": if (isNumberLike(v)) pass++; break;
      case "positive_number": if (isPositiveNumber(v)) pass++; break;
      case "integer": if (isInteger(v)) pass++; break;
      case "date": if (isDateLike(v)) pass++; break;
      case "time": if (isTimeLike(v)) pass++; break;
      case "text":
      case "categorical": if (isTextLike(v) || typeof v === "number") pass++; break;
    }
  }
  const ratio = pass / nonEmpty.length;
  if (ratio >= 0.85) return "ok";
  if (ratio >= 0.5) return "warn";
  return "fail";
}

// ---------------------------------------------------------------------------
// File-kind detection
// ---------------------------------------------------------------------------

function detectFileKind(
  mappings: Partial<Record<CanonicalField, FieldMapping>>,
  filename: string | undefined,
): { kind: FileKind; confidence: ConfidenceBand } {
  const fn = (filename ?? "").toLowerCase();
  const has = (f: CanonicalField) => !!mappings[f];

  // Filename hints first (fast path).
  if (/\b(rota|roster|schedule|labour|labor|payroll|ukg|kronos|fourth|rotaready|7shifts|unifocus)\b/.test(fn)) {
    if (has("labor_cost") || has("hours_worked") || has("fully_loaded_labor_cost")) {
      return { kind: "labor_rota", confidence: "high" };
    }
  }
  if (/\b(menu|item|majorgroup|category|family)\b/.test(fn) && (has("menu_item") || has("category") || has("major_group"))) {
    return { kind: "menu_item_sales", confidence: "high" };
  }
  if (/\b(check|guest|receipt|tender|payment)\b/.test(fn) && (has("check_id") || has("payment_method"))) {
    return { kind: "guest_check", confidence: "high" };
  }
  if (/\bemployee|staff|server\b/.test(fn) && has("employee_id") && has("server_name") && !has("gross_sales") && !has("labor_cost")) {
    return { kind: "employee_master", confidence: "high" };
  }
  if (/(revenue.?cent|outlet|rvc)/.test(fn) && (has("revenue_centre") || has("outlet")) && !has("gross_sales") && !has("labor_cost")) {
    return { kind: "outlet_master", confidence: "high" };
  }

  // Column signature.
  if ((has("fully_loaded_labor_cost") || has("labor_cost") || has("hours_worked")) && (has("server_name") || has("employee_id"))) {
    return { kind: "labor_rota", confidence: "high" };
  }
  if ((has("menu_item") || has("major_group") || has("category")) && (has("item_revenue") || has("quantity") || has("unit_price"))) {
    return { kind: "menu_item_sales", confidence: "high" };
  }
  if (has("check_id") && (has("payment_method") || has("payment_total") || has("check_open_time"))) {
    return { kind: "guest_check", confidence: "high" };
  }
  if ((has("gross_sales") || has("net_sales")) && (has("covers_served") || has("checks"))) {
    return { kind: "pos_sales", confidence: "high" };
  }
  if (has("gross_sales") || has("net_sales")) {
    return { kind: "pos_sales", confidence: "medium" };
  }
  return { kind: "unknown", confidence: "low" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DetectOpts = {
  /** Limit the detector to a subset of canonical fields, if you know the importer only needs those. */
  fields?: CanonicalField[];
  /** Sample rows used for data-pattern validation. */
  sampleRows?: Array<Record<string, unknown>>;
  filename?: string;
};

export function detectColumns(headers: string[], opts: DetectOpts = {}): DetectionResult {
  const fieldDefs = opts.fields
    ? FIELDS.filter((f) => opts.fields!.includes(f.field))
    : FIELDS;

  // Score every (header, field) pair.
  type Cand = { header: string; field: CanonicalField; score: number };
  const candidates: Cand[] = [];
  const headerInfo = headers.map((h) => ({
    raw: h,
    tokens: tokenizeHeader(h),
    norm: normalizeHeader(h),
  }));

  for (const h of headerInfo) {
    for (const def of fieldDefs) {
      const s = scoreField(h.tokens, h.norm, def);
      if (s > 0.4) candidates.push({ header: h.raw, field: def.field, score: s });
    }
  }

  // Greedy assignment: pick the highest-scoring (field, header) pair, lock both,
  // continue. Records alternates for the review panel.
  const byField = new Map<CanonicalField, Cand[]>();
  for (const c of candidates) {
    const arr = byField.get(c.field) ?? [];
    arr.push(c);
    byField.set(c.field, arr);
  }
  for (const arr of byField.values()) arr.sort((a, b) => b.score - a.score);

  const sortedCands = [...candidates].sort((a, b) => b.score - a.score);
  const usedHeaders = new Set<string>();
  const usedFields = new Set<CanonicalField>();
  const chosen: Partial<Record<CanonicalField, Cand>> = {};
  for (const c of sortedCands) {
    if (usedHeaders.has(c.header) || usedFields.has(c.field)) continue;
    chosen[c.field] = c;
    usedHeaders.add(c.header);
    usedFields.add(c.field);
  }

  // Build mapping objects.
  const sample = (opts.sampleRows ?? []).slice(0, 25);
  const mappings: Partial<Record<CanonicalField, FieldMapping>> = {};
  for (const [fieldKey, c] of Object.entries(chosen)) {
    if (!c) continue;
    const field = fieldKey as CanonicalField;
    const def = fieldDefs.find((d) => d.field === field)!;
    const samples = sample.map((r) => r[c.header]);
    const validation = validateSample(def.pattern, samples);

    // Confidence band: score margin over runner-up + validation outcome.
    const alts = (byField.get(field) ?? []).filter((x) => x.header !== c.header).slice(0, 3);
    const margin = c.score - (alts[0]?.score ?? 0);
    let band: ConfidenceBand = "low";
    if (c.score >= 0.85 && (validation === "ok" || validation === null) && margin >= 0.1) band = "high";
    else if (c.score >= 0.7 && validation !== "fail") band = "high";
    else if (c.score >= 0.55 && validation !== "fail") band = "medium";
    if (validation === "fail") band = "low";

    mappings[field] = {
      field,
      header: c.header,
      score: c.score,
      confidence: band,
      alternates: alts.map((a) => ({ header: a.header, score: a.score })),
      validation,
      reason: explainReason(c.score, validation, alts.length > 0),
    };
  }

  const headerToField: Record<string, CanonicalField | null> = {};
  for (const h of headers) headerToField[h] = null;
  for (const m of Object.values(mappings)) {
    if (m) headerToField[m.header] = m.field;
  }

  const fk = detectFileKind(mappings, opts.filename);
  const warnings: string[] = [];
  for (const m of Object.values(mappings)) {
    if (m?.validation === "warn") warnings.push(`${m.header} → ${m.field}: data pattern only partially matches.`);
    if (m?.validation === "fail") warnings.push(`${m.header} → ${m.field}: data values don't look right; consider re-mapping.`);
  }

  return {
    mappings,
    headerToField,
    fileKind: fk.kind,
    fileKindConfidence: fk.confidence,
    warnings,
  };
}

function explainReason(score: number, validation: "ok" | "warn" | "fail" | null, hasAlts: boolean): string {
  if (score >= 0.95) return "exact synonym match";
  if (score >= 0.85) return validation === "ok" ? "strong token match + data validates" : "strong token match";
  if (score >= 0.7) return hasAlts ? "good match with other candidates" : "good match";
  if (score >= 0.55) return "partial match";
  return "weak match";
}

// ---------------------------------------------------------------------------
// Fallback calculations
// ---------------------------------------------------------------------------

/** Safe calculation helpers used by importers when a direct field is missing. */
export const fallbackCalculations = {
  laborCost: (hours: number | null, rate: number | null): number | null => {
    if (hours == null || rate == null) return null;
    if (hours < 0 || rate < 0) return null;
    return hours * rate;
  },
  netSales: (gross: number | null, discount = 0, comp = 0, voidAmt = 0, refund = 0): number | null => {
    if (gross == null) return null;
    return gross - (discount || 0) - (comp || 0) - (voidAmt || 0) - (refund || 0);
  },
  salesPerHour: (sales: number | null, hours: number | null): number | null => {
    if (sales == null || hours == null || hours <= 0) return null;
    return sales / hours;
  },
  averagePerCover: (sales: number | null, covers: number | null): number | null => {
    if (sales == null || covers == null || covers <= 0) return null;
    return sales / covers;
  },
  averageCheck: (sales: number | null, checks: number | null): number | null => {
    if (sales == null || checks == null || checks <= 0) return null;
    return sales / checks;
  },
  coversPerHour: (covers: number | null, hours: number | null): number | null => {
    if (covers == null || hours == null || hours <= 0) return null;
    return covers / hours;
  },
  laborPercentage: (laborCost: number | null, netSales: number | null): number | null => {
    if (laborCost == null || netSales == null || netSales <= 0) return null;
    return laborCost / netSales;
  },
  baseLls: (netSales: number | null, laborCost: number | null): number | null => {
    if (netSales == null || laborCost == null || laborCost <= 0) return null;
    return netSales / laborCost;
  },
};

// ---------------------------------------------------------------------------
// Mapping summary helper — used by both the LLS importer and server-gap UI
// to render the "Detected mappings" review panel without re-implementing
// logic per page.
// ---------------------------------------------------------------------------

/**
 * Resolve a mapping for a specific importer's required+optional field set.
 * Returns:
 *  - resolved: canonical field → raw header (high or medium confidence)
 *  - needsConfirm: required field keys that are missing, low-confidence, or fail validation
 *  - lowConfidence: medium/low fields the user may want to review but won't block on
 */
export function resolveForImporter(
  detection: DetectionResult,
  required: CanonicalField[],
  optional: CanonicalField[] = [],
): {
  resolved: Partial<Record<CanonicalField, string>>;
  needsConfirm: CanonicalField[];
  lowConfidence: CanonicalField[];
} {
  const resolved: Partial<Record<CanonicalField, string>> = {};
  const needsConfirm: CanonicalField[] = [];
  const lowConfidence: CanonicalField[] = [];

  for (const f of [...required, ...optional]) {
    const m = detection.mappings[f];
    if (!m) {
      if (required.includes(f)) needsConfirm.push(f);
      continue;
    }
    if (m.confidence === "high") {
      resolved[f] = m.header;
    } else if (m.confidence === "medium") {
      resolved[f] = m.header;
      lowConfidence.push(f);
    } else {
      if (required.includes(f)) needsConfirm.push(f);
      else lowConfidence.push(f);
    }
  }
  return { resolved, needsConfirm, lowConfidence };
}
