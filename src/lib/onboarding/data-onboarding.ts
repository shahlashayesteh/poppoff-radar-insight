// Phase 25 — Data Onboarding & Export Templates.
//
// Pure module: field registries, downloadable template definitions,
// source-system guide, import-mapping help, and a lightweight data
// readiness scorer.
//
// Hard rules (mirrored in tests):
//   - Required, optional and contextual fields are strictly separated.
//   - Section / rota / reservation data are CONTEXT ONLY unless verified.
//   - LLS formulas are NOT touched. Adjusted LLS stays applied v1.
//   - No I/O, no DOM, no server access. Safe to import from manager UI
//     and from server-function modules. NEVER import from /server/* routes.

// ---------- types ----------

export type FieldTier = "required" | "optional" | "contextual";

export type ReliabilityLabel =
  | "measured"
  | "derived"
  | "estimated"
  | "contextual"
  | "untrusted";

export interface OnboardingField {
  key: string;
  label: string;
  tier: FieldTier;
  reliability: ReliabilityLabel;
  feedsScoring: boolean;
  explanation: string;
}

export interface ExportTemplate {
  id:
    | "pos_sales"
    | "item_sales"
    | "labour_hours"
    | "menu_category"
    | "rota_context";
  title: string;
  description: string;
  required: boolean;
  columns: Array<{
    name: string;
    required: boolean;
    description: string;
    reliability: ReliabilityLabel;
  }>;
  sampleRow: Record<string, string>;
}

export interface SourceSystemEntry {
  id:
    | "pos"
    | "labour_timeclock"
    | "rota"
    | "reservation"
    | "menu";
  title: string;
  trusted: string[];      // PoppOff treats as measured
  derived: string[];      // PoppOff treats as derived
  estimated: string[];    // PoppOff treats as estimated (warnings)
  contextual: string[];   // colour only
  notUsedForScoring: string[];
}

export interface ImportMappingHelp {
  field: string;
  label: string;
  reliability: ReliabilityLabel;
  feedsScoring: boolean;
  helpText: string;
}

// ---------- field registries ----------

/** Required for strong scoring. */
export const REQUIRED_FIELDS: OnboardingField[] = [
  {
    key: "server_employee_id",
    label: "Server or employee ID",
    tier: "required",
    reliability: "measured",
    feedsScoring: true,
    explanation:
      "PoppOff uses the source-system ID (POS or timeclock) to keep identities unambiguous. Name-only matches are blocked when the ID conflicts.",
  },
  {
    key: "check_total",
    label: "Sales / check total",
    tier: "required",
    reliability: "measured",
    feedsScoring: true,
    explanation:
      "Net sales rung in by the server. If a server rang in a water, PoppOff treats that as measured POS data.",
  },
  {
    key: "check_timestamp",
    label: "Check timestamp",
    tier: "required",
    reliability: "measured",
    feedsScoring: true,
    explanation: "Used for daypart, day-of-week and trading pattern analysis.",
  },
  {
    key: "labour_hours",
    label: "Labour hours / shift hours",
    tier: "required",
    reliability: "measured",
    feedsScoring: true,
    explanation:
      "Clocked or scheduled hours per server. Without hours, PoppOff can show preview only, not decision grade.",
  },
  {
    key: "venue_id",
    label: "Venue ID or venue selection",
    tier: "required",
    reliability: "measured",
    feedsScoring: true,
    explanation: "Every row must belong to a selected venue so RLS and scoring stay venue-scoped.",
  },
  {
    key: "item_or_category_sales",
    label: "Item or category sales (where available)",
    tier: "required",
    reliability: "measured",
    feedsScoring: true,
    explanation:
      "Item-level or category-level sales let PoppOff explain WHERE the gap is — drinks vs starters vs dessert.",
  },
];

/** Useful but optional. */
export const OPTIONAL_FIELDS: OnboardingField[] = [
  {
    key: "menu_category",
    label: "Menu category",
    tier: "optional",
    reliability: "measured",
    feedsScoring: true,
    explanation: "Improves category mix analysis but is not required for base scoring.",
  },
  {
    key: "item_detail",
    label: "Item-level detail",
    tier: "optional",
    reliability: "measured",
    feedsScoring: true,
    explanation: "Enables menu intelligence and AI weekly priorities.",
  },
  {
    key: "covers",
    label: "Covers",
    tier: "optional",
    reliability: "derived",
    feedsScoring: true,
    explanation: "Used for revenue-per-cover where available; never invented when missing.",
  },
  {
    key: "payment_status",
    label: "Payment status",
    tier: "optional",
    reliability: "measured",
    feedsScoring: false,
    explanation: "Helps exclude voids and refunds. Does not directly score performance.",
  },
  {
    key: "outlet_or_revenue_centre",
    label: "Outlet / revenue centre",
    tier: "optional",
    reliability: "measured",
    feedsScoring: true,
    explanation: "Used when reliable. Treated as context only if mappings look unstable.",
  },
];

/** Context only unless explicitly verified. */
export const CONTEXTUAL_FIELDS: OnboardingField[] = [
  {
    key: "sevenrooms_section",
    label: "SevenRooms section",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation:
      "If SevenRooms says a server worked a section, PoppOff treats that as context unless verified by the operator.",
  },
  {
    key: "rota_section",
    label: "Rota section",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Rota sections are scheduling intent, not measured floor activity.",
  },
  {
    key: "table_allocation",
    label: "Table allocation",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Allocations vary live; not used for hard scoring.",
  },
  {
    key: "booking_type",
    label: "Booking type",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Useful colour; never a scoring input on its own.",
  },
  {
    key: "party_size",
    label: "Party size",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Helpful for explanation; not used as a hard scoring signal.",
  },
  {
    key: "walkin_vs_booking",
    label: "Walk-in vs booking",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Shown as context only.",
  },
  {
    key: "manager_notes",
    label: "Manager notes",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Free-text manager notes are never used to score servers.",
  },
  {
    key: "weather",
    label: "Weather",
    tier: "contextual",
    reliability: "contextual",
    feedsScoring: false,
    explanation: "Shown as colour. Never feeds confident hard scoring.",
  },
];

export const ALL_ONBOARDING_FIELDS: OnboardingField[] = [
  ...REQUIRED_FIELDS,
  ...OPTIONAL_FIELDS,
  ...CONTEXTUAL_FIELDS,
];

// ---------- export templates ----------

export const TEMPLATES: ExportTemplate[] = [
  {
    id: "pos_sales",
    title: "POS sales export",
    description:
      "Check-level sales from your POS. One row per check. Required for any decision-grade scoring.",
    required: true,
    columns: [
      { name: "venue_id", required: true, description: "Venue identifier used inside PoppOff.", reliability: "measured" },
      { name: "check_id", required: true, description: "Unique check / order ID.", reliability: "measured" },
      { name: "check_timestamp", required: true, description: "ISO timestamp the check was opened or closed.", reliability: "measured" },
      { name: "server_employee_id", required: true, description: "POS-side server / employee identifier.", reliability: "measured" },
      { name: "check_total", required: true, description: "Net check total in venue currency.", reliability: "measured" },
      { name: "covers", required: false, description: "Number of covers on the check, if your POS records it.", reliability: "derived" },
      { name: "payment_status", required: false, description: "paid / void / refunded.", reliability: "measured" },
      { name: "outlet", required: false, description: "Outlet or revenue centre, if reliable.", reliability: "measured" },
    ],
    sampleRow: {
      venue_id: "venue-001",
      check_id: "CHK-1023",
      check_timestamp: "2026-06-20T19:42:00Z",
      server_employee_id: "EMP-42",
      check_total: "118.50",
      covers: "2",
      payment_status: "paid",
      outlet: "main_floor",
    },
  },
  {
    id: "item_sales",
    title: "Item sales export",
    description: "Item-level sales joined to a check. Enables menu intelligence and category mix.",
    required: false,
    columns: [
      { name: "venue_id", required: true, description: "Venue identifier.", reliability: "measured" },
      { name: "check_id", required: true, description: "Foreign key to a row in the POS sales export.", reliability: "measured" },
      { name: "item_name", required: true, description: "Item name as rung in.", reliability: "measured" },
      { name: "item_quantity", required: true, description: "Quantity rung in.", reliability: "measured" },
      { name: "item_price", required: true, description: "Unit price.", reliability: "measured" },
      { name: "menu_category", required: false, description: "Menu category, where the POS records it.", reliability: "measured" },
    ],
    sampleRow: {
      venue_id: "venue-001",
      check_id: "CHK-1023",
      item_name: "House Negroni",
      item_quantity: "1",
      item_price: "12.00",
      menu_category: "cocktails",
    },
  },
  {
    id: "labour_hours",
    title: "Labour hours / timeclock export",
    description: "Hours worked per server per shift. Required for decision-grade scoring.",
    required: true,
    columns: [
      { name: "venue_id", required: true, description: "Venue identifier.", reliability: "measured" },
      { name: "labour_employee_id", required: true, description: "Timeclock-side employee identifier.", reliability: "measured" },
      { name: "shift_date", required: true, description: "Date of the shift (YYYY-MM-DD).", reliability: "measured" },
      { name: "clock_in", required: true, description: "Clock-in timestamp.", reliability: "measured" },
      { name: "clock_out", required: true, description: "Clock-out timestamp.", reliability: "measured" },
      { name: "clock_hours", required: true, description: "Hours actually worked.", reliability: "measured" },
      { name: "wage_cost", required: false, description: "Wage cost basis for labour cost calculations.", reliability: "measured" },
    ],
    sampleRow: {
      venue_id: "venue-001",
      labour_employee_id: "EMP-42",
      shift_date: "2026-06-20",
      clock_in: "2026-06-20T17:55:00Z",
      clock_out: "2026-06-20T23:31:00Z",
      clock_hours: "5.6",
      wage_cost: "78.40",
    },
  },
  {
    id: "menu_category",
    title: "Menu / category template",
    description: "Optional reference list so item names map cleanly to categories.",
    required: false,
    columns: [
      { name: "venue_id", required: true, description: "Venue identifier.", reliability: "measured" },
      { name: "item_name", required: true, description: "Canonical item name.", reliability: "measured" },
      { name: "menu_category", required: true, description: "Category the item belongs to.", reliability: "measured" },
      { name: "price", required: false, description: "Reference price.", reliability: "measured" },
      { name: "margin", required: false, description: "Reference margin %.", reliability: "estimated" },
    ],
    sampleRow: {
      venue_id: "venue-001",
      item_name: "House Negroni",
      menu_category: "cocktails",
      price: "12.00",
      margin: "0.74",
    },
  },
  {
    id: "rota_context",
    title: "Rota export (optional context only)",
    description:
      "Rota / scheduling data. Treated as context, never as hard scoring truth unless verified.",
    required: false,
    columns: [
      { name: "venue_id", required: true, description: "Venue identifier.", reliability: "measured" },
      { name: "rota_employee_id", required: true, description: "Rota-system employee identifier.", reliability: "measured" },
      { name: "shift_date", required: true, description: "Date of the scheduled shift.", reliability: "measured" },
      { name: "rota_section", required: false, description: "Scheduled section. Context only.", reliability: "contextual" },
      { name: "rota_role", required: false, description: "Scheduled role. Context only.", reliability: "contextual" },
    ],
    sampleRow: {
      venue_id: "venue-001",
      rota_employee_id: "EMP-42",
      shift_date: "2026-06-20",
      rota_section: "bar",
      rota_role: "server",
    },
  },
];

// ---------- source system guide ----------

export const SOURCE_SYSTEM_GUIDE: SourceSystemEntry[] = [
  {
    id: "pos",
    title: "POS system (Toast, Square, Lightspeed, Micros, etc.)",
    trusted: ["check total", "server employee ID", "check timestamp", "item name", "item quantity"],
    derived: ["covers (if recorded)", "revenue per cover"],
    estimated: ["category mapping when items aren't tagged"],
    contextual: ["table number"],
    notUsedForScoring: ["manager comp reasons (free text)"],
  },
  {
    id: "labour_timeclock",
    title: "Labour / timeclock system (Deputy, 7shifts, Harri, etc.)",
    trusted: ["labour employee ID", "clock-in / clock-out", "clock hours"],
    derived: ["labour cost per hour when wage data is provided"],
    estimated: ["labour hours back-filled from rota when timeclock is missing"],
    contextual: ["scheduled role"],
    notUsedForScoring: ["unverified manual edits to hours"],
  },
  {
    id: "rota",
    title: "Rota / scheduling system",
    trusted: ["scheduled employee ID", "scheduled date"],
    derived: [],
    estimated: ["expected hours when timeclock is missing"],
    contextual: ["scheduled section", "scheduled role"],
    notUsedForScoring: ["section assignments (treated as context only)"],
  },
  {
    id: "reservation",
    title: "Reservation system (SevenRooms, OpenTable, Resy, etc.)",
    trusted: ["covers per service (aggregate)"],
    derived: [],
    estimated: ["walk-in counts when not explicitly recorded"],
    contextual: ["booking type", "party size", "section", "walk-in vs booking"],
    notUsedForScoring: ["section-to-server attribution (treated as context only unless verified)"],
  },
  {
    id: "menu",
    title: "Menu system / PMIX",
    trusted: ["item name", "category"],
    derived: ["category mix"],
    estimated: ["margin where only price is provided"],
    contextual: ["seasonal availability flags"],
    notUsedForScoring: ["unverified vendor cost notes"],
  },
];

// ---------- import mapping help ----------

export const IMPORT_MAPPING_HELP: ImportMappingHelp[] = [
  {
    field: "server_employee_id",
    label: "Server / employee ID",
    reliability: "measured",
    feedsScoring: true,
    helpText: "Measured: the source-system ID. PoppOff uses this as the authoritative identity.",
  },
  {
    field: "check_total",
    label: "Check total",
    reliability: "measured",
    feedsScoring: true,
    helpText: "Measured: net check total from the POS. Feeds scoring directly.",
  },
  {
    field: "labour_hours",
    label: "Labour hours",
    reliability: "measured",
    feedsScoring: true,
    helpText: "Measured: clocked or scheduled hours. Required for decision-grade scoring.",
  },
  {
    field: "covers",
    label: "Covers",
    reliability: "derived",
    feedsScoring: true,
    helpText: "Derived: revenue-per-cover is calculated only when covers are present.",
  },
  {
    field: "menu_category_fallback",
    label: "Menu category (fallback)",
    reliability: "estimated",
    feedsScoring: true,
    helpText:
      "Estimated: applied with a visible warning when the POS did not tag the item. Shown but flagged.",
  },
  {
    field: "sevenrooms_section",
    label: "SevenRooms section",
    reliability: "contextual",
    feedsScoring: false,
    helpText:
      "Contextual: shown for explanation only. Never feeds confident hard scoring unless explicitly verified.",
  },
  {
    field: "weather",
    label: "Weather",
    reliability: "contextual",
    feedsScoring: false,
    helpText: "Contextual: colour only. Never used for scoring.",
  },
  {
    field: "manager_free_text",
    label: "Manager free-text notes",
    reliability: "untrusted",
    feedsScoring: false,
    helpText: "Untrusted: ambiguous data. Blocked from scoring entirely.",
  },
];

// ---------- readiness scoring ----------

export interface ReadinessSignals {
  /** Can we identify each server safely (POS or labour ID present, low ambiguity)? */
  hasServerIdentity: boolean;
  /** Do we have sales by server? */
  hasSalesByServer: boolean;
  /** Do we have timestamps on checks? */
  hasTimestamps: boolean;
  /** Do we have labour hours? */
  hasLabourHours: boolean;
  /** Do we know what the sales number actually represents (net vs gross)? */
  hasKnownSalesBasis: boolean;
  /** Do we know what the labour number actually represents (wages vs fully loaded)? */
  hasKnownLabourBasis: boolean;
  /** Do we have item-level or category-level sales? */
  hasItemOrCategory: boolean;
  /** Are sections verified by the operator (true) or only contextual (false)? */
  sectionsVerified: boolean;
  /** Do we ONLY have rota or reservation data (no POS/labour)? */
  onlyRotaOrReservation: boolean;
}

export type ReadinessLevel =
  | "strong"        // ready for strong scoring
  | "warning"      // ready with warnings
  | "context_only" // only context fields supplied
  | "insufficient"; // not enough data

export interface ReadinessChecklistItem {
  id: keyof ReadinessSignals;
  label: string;
  ok: boolean;
  required: boolean;
}

export interface ReadinessResult {
  level: ReadinessLevel;
  headline: string;
  checklist: ReadinessChecklistItem[];
  warnings: string[];
  feedsScoring: boolean;
}

const CHECKLIST_DEFS: Array<Omit<ReadinessChecklistItem, "ok">> = [
  { id: "hasServerIdentity", label: "Can we identify each server safely?", required: true },
  { id: "hasSalesByServer", label: "Do we have sales by server?", required: true },
  { id: "hasTimestamps", label: "Do we have timestamps?", required: true },
  { id: "hasLabourHours", label: "Do we have labour hours?", required: true },
  { id: "hasKnownSalesBasis", label: "Do we know sales basis (net vs gross)?", required: false },
  { id: "hasKnownLabourBasis", label: "Do we know labour basis (wages vs fully loaded)?", required: false },
  { id: "hasItemOrCategory", label: "Do we have item or category data?", required: false },
  { id: "sectionsVerified", label: "Are sections verified (not only contextual)?", required: false },
];

export function evaluateReadiness(signals: ReadinessSignals): ReadinessResult {
  const checklist: ReadinessChecklistItem[] = CHECKLIST_DEFS.map((d) => ({
    ...d,
    ok: Boolean(signals[d.id]),
  }));

  const warnings: string[] = [];

  // Context-only path: ONLY rota / reservation present, no POS or labour.
  if (
    signals.onlyRotaOrReservation &&
    !signals.hasSalesByServer &&
    !signals.hasLabourHours
  ) {
    return {
      level: "context_only",
      headline:
        "Context only — rota or reservation data alone cannot power scoring. Add POS sales and labour hours.",
      checklist,
      warnings: [
        "Section, rota and reservation data are context only unless verified.",
        "PoppOff will not produce decision-grade scoring from rota/reservation data alone.",
      ],
      feedsScoring: false,
    };
  }

  // Hard requirements for any scoring at all.
  if (!signals.hasServerIdentity || !signals.hasSalesByServer || !signals.hasTimestamps) {
    return {
      level: "insufficient",
      headline: "Not enough data — server identity, sales by server and timestamps are required.",
      checklist,
      warnings: [
        !signals.hasServerIdentity ? "Missing safe server identity." : "",
        !signals.hasSalesByServer ? "Missing sales by server." : "",
        !signals.hasTimestamps ? "Missing check timestamps." : "",
      ].filter(Boolean),
      feedsScoring: false,
    };
  }

  if (!signals.hasLabourHours) {
    warnings.push("Labour hours missing — PoppOff may show preview only, not decision grade.");
  }
  if (!signals.hasKnownSalesBasis) {
    warnings.push("Sales basis unknown — confidence reduced; numbers shown with a warning badge.");
  }
  if (!signals.hasKnownLabourBasis && signals.hasLabourHours) {
    warnings.push("Labour basis unknown — labour cost shown with a warning badge.");
  }
  if (!signals.hasItemOrCategory) {
    warnings.push("No item or category data — menu intelligence will be limited.");
  }
  if (!signals.sectionsVerified) {
    warnings.push("Sections treated as context only — not used for hard scoring.");
  }

  const strong =
    signals.hasServerIdentity &&
    signals.hasSalesByServer &&
    signals.hasTimestamps &&
    signals.hasLabourHours &&
    signals.hasKnownSalesBasis;

  if (strong) {
    return {
      level: "strong",
      headline: "Ready for strong scoring.",
      checklist,
      warnings,
      feedsScoring: true,
    };
  }

  return {
    level: "warning",
    headline: "Ready with warnings — scoring will run but confidence is reduced.",
    checklist,
    warnings,
    feedsScoring: true,
  };
}

// ---------- CSV helper for downloadable templates ----------

export function templateToCsv(t: ExportTemplate): string {
  const header = t.columns.map((c) => c.name).join(",");
  const row = t.columns.map((c) => csvEscape(t.sampleRow[c.name] ?? "")).join(",");
  return `${header}\n${row}\n`;
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
