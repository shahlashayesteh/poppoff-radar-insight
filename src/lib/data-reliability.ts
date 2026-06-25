/**
 * Phase 17 — Data Source Reliability Framework
 *
 * Foundation + safety layer that classifies every restaurant data field
 * PoppOff consumes. The goal is to keep "hard" POS / labour facts strictly
 * separated from "soft" contextual signals (rota sections, reservation
 * platform sections, booking types, weather, manager notes) so that the
 * product never invents confidence it has not earned.
 *
 * RULES (enforced by canUseForScoring / requiresWarning / etc.)
 *   - measured       → safe to feed scoring directly
 *   - derived        → safe to feed scoring when its inputs are valid
 *   - estimated      → may feed scoring ONLY with a visible warning
 *   - contextual     → may support recommendations only if explicitly verified;
 *                       never feeds confident hard scoring on its own
 *   - untrusted      → never feeds scoring under any condition
 *
 * NOTE: This module is intentionally pure / typed metadata + small helpers.
 *   - No React imports.
 *   - No DB calls.
 *   - Safe to import from server functions, recommendation engines and the
 *     manager UI alike.
 *   - DO NOT import from /server/* routes; reliability labels are part of
 *     manager intelligence.
 */

/* ──────────────────────────────────────────────────────────────────────── *
 * Enums
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * How trustworthy is the field for scoring?
 *
 *  - measured    : directly recorded operational event (rang in, clocked in)
 *  - derived     : pure calculation from measured inputs
 *  - estimated   : reasonable fallback when the exact field is missing
 *  - contextual  : useful as colour / explanation but not hard truth on its own
 *  - untrusted   : too ambiguous to use for scoring at all
 */
export type ReliabilityClass =
  | "measured"
  | "derived"
  | "estimated"
  | "contextual"
  | "untrusted";

/**
 * Where does the value originate? Used to drive provenance copy and to
 * distinguish e.g. "POS section" (close to truth) from "Reservation
 * platform section" (often manually re-assigned at service time).
 */
export type SourceSystem =
  | "pos" // till / point-of-sale
  | "labour" // payroll / timeclock export
  | "rota" // scheduling tool
  | "reservation" // OpenTable / SevenRooms / Resy etc.
  | "menu" // menu engineering / item master
  | "manager_input" // values typed by the manager in PoppOff
  | "derived" // computed by PoppOff from other fields
  | "external" // weather, events, market data
  | "unknown";

/**
 * Difficulty of reliably extracting the field from a typical export.
 *
 *  - trivial    : standard column in every POS / labour export
 *  - moderate   : commonly present but inconsistent header or basis
 *  - hard       : requires venue-specific mapping or manual confirmation
 *  - unreliable : frequently missing / ambiguous / overwritten in practice
 */
export type ExtractionDifficulty =
  | "trivial"
  | "moderate"
  | "hard"
  | "unreliable";

/**
 * What this field is *allowed* to do inside PoppOff.
 *
 *  - scoring     : can feed numeric scoring (LLS, RAG, server rank, ...)
 *  - context     : can support recommendations and explanations only
 *  - excluded    : may be displayed but must not influence any decision
 */
export type CalculationSafety = "scoring" | "context" | "excluded";

/* ──────────────────────────────────────────────────────────────────────── *
 * Field registry
 * ──────────────────────────────────────────────────────────────────────── */

export interface ReliabilityEntry {
  /** Canonical field id used throughout PoppOff. */
  field: string;
  /** Human-readable label for tooltips / UI surfaces. */
  label: string;
  reliability: ReliabilityClass;
  source: SourceSystem;
  extraction: ExtractionDifficulty;
  safety: CalculationSafety;
  /**
   * If true, the field may only be relied on once the venue has explicitly
   * confirmed it (e.g. SevenRooms section after manager verification).
   */
  requiresVerification?: boolean;
  /** Short notes shown next to the badge / in import review. */
  notes?: string;
}

/**
 * Canonical registry. Keep keys snake_case and stable — they are referenced
 * by import column mapping, recommendation evidence labels and tests.
 */
export const FIELD_REGISTRY: Record<string, ReliabilityEntry> = {
  /* ── Hard POS facts ────────────────────────────────────────────────── */
  pos_item_sold: {
    field: "pos_item_sold",
    label: "POS item sold",
    reliability: "measured",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
  },
  pos_item_quantity: {
    field: "pos_item_quantity",
    label: "POS item quantity",
    reliability: "measured",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
  },
  pos_item_price: {
    field: "pos_item_price",
    label: "POS item price",
    reliability: "measured",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
  },
  pos_menu_category: {
    field: "pos_menu_category",
    label: "POS menu category",
    reliability: "measured",
    source: "pos",
    extraction: "moderate",
    safety: "scoring",
    notes: "Category mapping varies by POS; verify mapping per venue.",
  },
  pos_check_total: {
    field: "pos_check_total",
    label: "POS check total",
    reliability: "measured",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
  },
  pos_check_timestamp: {
    field: "pos_check_timestamp",
    label: "POS check timestamp",
    reliability: "measured",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
  },
  pos_server_id: {
    field: "pos_server_id",
    label: "POS server ID",
    reliability: "measured",
    source: "pos",
    extraction: "moderate",
    safety: "scoring",
    requiresVerification: true,
    notes:
      "Measured at source but requires identity match validation before " +
      "server-level scoring.",
  },
  pos_payment_status: {
    field: "pos_payment_status",
    label: "Payment / check status",
    reliability: "measured",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
  },

  /* ── Hard labour facts ─────────────────────────────────────────────── */
  labour_clock_in: {
    field: "labour_clock_in",
    label: "Clock-in",
    reliability: "measured",
    source: "labour",
    extraction: "trivial",
    safety: "scoring",
  },
  labour_clock_out: {
    field: "labour_clock_out",
    label: "Clock-out",
    reliability: "measured",
    source: "labour",
    extraction: "trivial",
    safety: "scoring",
  },
  labour_paid_hours: {
    field: "labour_paid_hours",
    label: "Paid hours",
    reliability: "measured",
    source: "labour",
    extraction: "trivial",
    safety: "scoring",
  },
  labour_wage_cost_known_basis: {
    field: "labour_wage_cost_known_basis",
    label: "Wage cost (basis known)",
    reliability: "measured",
    source: "labour",
    extraction: "moderate",
    safety: "scoring",
  },
  labour_wage_cost_unknown_basis: {
    field: "labour_wage_cost_unknown_basis",
    label: "Wage cost (basis unknown)",
    reliability: "estimated",
    source: "labour",
    extraction: "hard",
    safety: "scoring",
    notes:
      "Basis (wage-only / fully-loaded / on-cost) is unknown — must " +
      "display a warning before influencing LLS.",
  },

  /* ── Derived metrics ───────────────────────────────────────────────── */
  rpc: {
    field: "rpc",
    label: "Revenue per cover",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
    notes: "Allowed only when sales basis is valid and covers are measured.",
  },
  rph: {
    field: "rph",
    label: "Revenue per hour",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  lls_base: {
    field: "lls_base",
    label: "Base LLS",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  lls_adjusted: {
    field: "lls_adjusted",
    label: "Adjusted LLS",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  category_sales_per_cover: {
    field: "category_sales_per_cover",
    label: "Category sales per cover",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  dessert_sales_per_cover: {
    field: "dessert_sales_per_cover",
    label: "Dessert sales per cover",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  water_sales_per_cover: {
    field: "water_sales_per_cover",
    label: "Water sales per cover",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  wine_sales_per_cover: {
    field: "wine_sales_per_cover",
    label: "Wine sales per cover",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },
  average_check_value: {
    field: "average_check_value",
    label: "Average check value",
    reliability: "derived",
    source: "derived",
    extraction: "trivial",
    safety: "scoring",
  },

  /* ── Estimated fallbacks ───────────────────────────────────────────── */
  gross_used_as_net: {
    field: "gross_used_as_net",
    label: "Gross used as net (estimate)",
    reliability: "estimated",
    source: "pos",
    extraction: "trivial",
    safety: "scoring",
    notes:
      "Only gross sales available — used as a net estimate; must show a " +
      "warning everywhere it appears.",
  },
  hours_times_rate_labour: {
    field: "hours_times_rate_labour",
    label: "Hours × rate labour estimate",
    reliability: "estimated",
    source: "labour",
    extraction: "moderate",
    safety: "scoring",
    notes: "No fully-loaded cost — warns and labels as approximation.",
  },
  covers_estimated_from_bookings: {
    field: "covers_estimated_from_bookings",
    label: "Covers estimated from bookings",
    reliability: "estimated",
    source: "reservation",
    extraction: "moderate",
    safety: "scoring",
    notes:
      "Booking-derived covers are an estimate; lower confidence than POS " +
      "guest counts.",
  },

  /* ── Contextual (soft) signals ─────────────────────────────────────── */
  rota_scheduled_role: {
    field: "rota_scheduled_role",
    label: "Rota scheduled role",
    reliability: "contextual",
    source: "rota",
    extraction: "moderate",
    safety: "context",
  },
  rota_scheduled_shift: {
    field: "rota_scheduled_shift",
    label: "Rota scheduled shift",
    reliability: "contextual",
    source: "rota",
    extraction: "moderate",
    safety: "context",
  },
  rota_scheduled_section: {
    field: "rota_scheduled_section",
    label: "Rota scheduled section",
    reliability: "contextual",
    source: "rota",
    extraction: "hard",
    safety: "context",
    requiresVerification: true,
    notes:
      "Sections are commonly re-assigned on the floor; never use as hard " +
      "truth without explicit verification.",
  },
  sevenrooms_section: {
    field: "sevenrooms_section",
    label: "SevenRooms section",
    reliability: "contextual",
    source: "reservation",
    extraction: "hard",
    safety: "context",
    requiresVerification: true,
    notes:
      "Reservation platform sections are frequently manually overridden " +
      "and must be verified before powering section-performance claims.",
  },
  table_allocation: {
    field: "table_allocation",
    label: "Table allocation",
    reliability: "contextual",
    source: "reservation",
    extraction: "hard",
    safety: "context",
    requiresVerification: true,
  },
  booking_type: {
    field: "booking_type",
    label: "Booking type",
    reliability: "contextual",
    source: "reservation",
    extraction: "moderate",
    safety: "context",
  },
  party_size: {
    field: "party_size",
    label: "Party size",
    reliability: "contextual",
    source: "reservation",
    extraction: "trivial",
    safety: "context",
  },
  walkin_vs_booking: {
    field: "walkin_vs_booking",
    label: "Walk-in vs booking",
    reliability: "contextual",
    source: "reservation",
    extraction: "moderate",
    safety: "context",
  },
  event_day: {
    field: "event_day",
    label: "Event day",
    reliability: "contextual",
    source: "manager_input",
    extraction: "moderate",
    safety: "context",
  },
  weather: {
    field: "weather",
    label: "Weather",
    reliability: "contextual",
    source: "external",
    extraction: "moderate",
    safety: "context",
  },
  manager_notes: {
    field: "manager_notes",
    label: "Manager notes",
    reliability: "contextual",
    source: "manager_input",
    extraction: "moderate",
    safety: "context",
  },

  /* ── Untrusted ─────────────────────────────────────────────────────── */
  unverified_section: {
    field: "unverified_section",
    label: "Unverified section data",
    reliability: "untrusted",
    source: "reservation",
    extraction: "unreliable",
    safety: "excluded",
    notes:
      "Section recorded but not verified against floor reality — cannot " +
      "feed section-performance scoring.",
  },
  duplicate_name_no_identity: {
    field: "duplicate_name_no_identity",
    label: "Duplicate name without confirmed identity",
    reliability: "untrusted",
    source: "labour",
    extraction: "unreliable",
    safety: "excluded",
    notes:
      "Multiple employees share this name and no confirmed identity " +
      "mapping exists — blocks confident server-level scoring.",
  },
  missing_server_id: {
    field: "missing_server_id",
    label: "Missing server ID",
    reliability: "untrusted",
    source: "pos",
    extraction: "unreliable",
    safety: "excluded",
    notes:
      "Server identifier is absent on the check — cannot attribute sales " +
      "to a server for scoring.",
  },
};

/* ──────────────────────────────────────────────────────────────────────── *
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Look up a field in the registry. Optionally narrow by source system, which
 * matters for fields that exist in multiple systems (e.g. section comes from
 * rota AND from reservation platforms).
 */
export function classifyFieldReliability(
  fieldName: string,
  sourceSystem?: SourceSystem,
): ReliabilityEntry {
  const direct = FIELD_REGISTRY[fieldName];
  if (direct && (!sourceSystem || direct.source === sourceSystem)) {
    return direct;
  }

  if (sourceSystem) {
    // Allow callers to ask about e.g. "section" with sourceSystem "rota" or
    // "reservation" and route to the appropriate registry entry.
    if (fieldName === "section" && sourceSystem === "rota")
      return FIELD_REGISTRY.rota_scheduled_section;
    if (fieldName === "section" && sourceSystem === "reservation")
      return FIELD_REGISTRY.sevenrooms_section;
  }

  return {
    field: fieldName,
    label: fieldName,
    reliability: "untrusted",
    source: sourceSystem ?? "unknown",
    extraction: "unreliable",
    safety: "excluded",
    notes: "Unknown field — defaulting to untrusted / excluded.",
  };
}

export type FieldLike = string | ReliabilityEntry;

function resolve(field: FieldLike): ReliabilityEntry {
  return typeof field === "string" ? classifyFieldReliability(field) : field;
}

/**
 * True iff the field is allowed to feed numeric scoring (LLS, RAG, server
 * ranking, recommendation rankings).
 *
 *  - measured                        → always allowed
 *  - derived                         → always allowed (when inputs valid)
 *  - estimated                       → allowed ONLY when caller opts in via
 *                                       `allowEstimatedWithWarning`
 *  - contextual                      → allowed ONLY when the field has been
 *                                       explicitly verified
 *  - untrusted                       → never
 */
export function canUseForScoring(
  field: FieldLike,
  options: { allowEstimatedWithWarning?: boolean; verified?: boolean } = {},
): boolean {
  const entry = resolve(field);
  if (entry.safety === "excluded") return false;
  switch (entry.reliability) {
    case "measured":
    case "derived":
      return true;
    case "estimated":
      return options.allowEstimatedWithWarning === true;
    case "contextual":
      return entry.requiresVerification
        ? options.verified === true
        : options.verified === true;
    case "untrusted":
      return false;
  }
}

/**
 * True iff the field may be used to enrich a recommendation / explanation,
 * even when it cannot drive scoring on its own.
 */
export function canUseForContext(field: FieldLike): boolean {
  const entry = resolve(field);
  return entry.safety !== "excluded" && entry.reliability !== "untrusted";
}

/** True iff using this field requires showing a visible warning to the user. */
export function requiresWarning(field: FieldLike): boolean {
  const entry = resolve(field);
  if (entry.reliability === "estimated") return true;
  if (entry.reliability === "contextual" && entry.requiresVerification)
    return true;
  if (entry.reliability === "untrusted") return true;
  return false;
}

const RELIABILITY_LABEL: Record<ReliabilityClass, string> = {
  measured: "Measured",
  derived: "Derived",
  estimated: "Estimated",
  contextual: "Contextual",
  untrusted: "Untrusted",
};

export function getReliabilityLabel(field: FieldLike): string {
  return RELIABILITY_LABEL[resolve(field).reliability];
}

/* ──────────────────────────────────────────────────────────────────────── *
 * Recommendation evidence
 *
 * Helper used by Coaching / Priorities / Menu Intelligence to package the
 * evidence basis of every recommendation. A recommendation must know which
 * fields it leans on and whether any of them require a warning.
 * ──────────────────────────────────────────────────────────────────────── */

export interface RecommendationEvidence {
  fields: ReliabilityEntry[];
  /** Strongest reliability present (measured > derived > estimated > contextual > untrusted). */
  strongest: ReliabilityClass;
  /** Weakest reliability present — drives the confidence banner. */
  weakest: ReliabilityClass;
  /** Confidence label fit for UI display. */
  confidence: "high" | "medium" | "low" | "blocked";
  /** True if any field requires a warning before display. */
  hasWarning: boolean;
  /** True if any field is untrusted / excluded — recommendation must be blocked. */
  isBlocked: boolean;
}

const RELIABILITY_ORDER: Record<ReliabilityClass, number> = {
  measured: 4,
  derived: 3,
  estimated: 2,
  contextual: 1,
  untrusted: 0,
};

export function buildRecommendationEvidence(
  fields: FieldLike[],
): RecommendationEvidence {
  const entries = fields.map(resolve);
  const blocked = entries.some(
    (e) => e.safety === "excluded" || e.reliability === "untrusted",
  );

  let strongest: ReliabilityClass = "untrusted";
  let weakest: ReliabilityClass = "measured";
  for (const e of entries) {
    if (RELIABILITY_ORDER[e.reliability] > RELIABILITY_ORDER[strongest])
      strongest = e.reliability;
    if (RELIABILITY_ORDER[e.reliability] < RELIABILITY_ORDER[weakest])
      weakest = e.reliability;
  }

  let confidence: RecommendationEvidence["confidence"];
  if (blocked) confidence = "blocked";
  else if (weakest === "measured" || weakest === "derived")
    confidence = "high";
  else if (weakest === "estimated") confidence = "medium";
  else confidence = "low";

  return {
    fields: entries,
    strongest,
    weakest,
    confidence,
    hasWarning: entries.some(requiresWarning),
    isBlocked: blocked,
  };
}
