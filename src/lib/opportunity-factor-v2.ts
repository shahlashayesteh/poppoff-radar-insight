/**
 * Phase 20 — Trusted Opportunity Factor v2
 *
 * Operator-safe Opportunity Factor that uses only reliable, extractable
 * restaurant data. Designed to power Adjusted LLS without changing the
 * LLS formula itself (Adjusted LLS = Base LLS ÷ Opportunity Factor).
 *
 * Hard rules (enforced here, see tests in
 * src/lib/__tests__/phase20-opportunity-factor-v2.test.ts):
 *   - HARD inputs:  POS check timestamp/totals/items/categories, POS server
 *                   ID (post identity match), payment status, labour paid
 *                   hours / clock in-out, derived daypart, derived
 *                   day-of-week, venue id, POS-measured covers, reliable
 *                   outlet / revenue centre.
 *   - DERIVED:      sales-per-hour, covers-per-hour, checks-per-hour,
 *                   category mix, team comparables, historical baselines.
 *   - ESTIMATED:    gross-used-as-net, hours×rate labour, booking-derived
 *                   covers — allowed only with warning + lower confidence.
 *   - CONTEXTUAL:   SevenRooms section, table allocation, rota section,
 *                   booking type, party size, walk-in/booking, manager
 *                   notes, weather. NEVER feed hard scoring unless
 *                   explicitly verified by a downstream control.
 *
 * Output is always {opportunity_factor, confidence, basis, inputs_used,
 * inputs_excluded, warnings, fallback_reason, explanation}. The factor is
 * always clamped to [OF_V2_CLAMP_MIN, OF_V2_CLAMP_MAX].
 *
 * Pure / typed. No React. No DB. Safe to import from server fns or
 * manager UI. NEVER import from /server/* routes — opportunity factor
 * mechanics are manager-only intelligence.
 */

/* ──────────────────────────────────────────────────────────────────────── *
 * Named constants — no magic numbers
 * ──────────────────────────────────────────────────────────────────────── */

/** Lower clamp on the final Opportunity Factor. */
export const OF_V2_CLAMP_MIN = 0.75;
/** Upper clamp on the final Opportunity Factor. */
export const OF_V2_CLAMP_MAX = 1.35;
/** Neutral / safe-default Opportunity Factor. */
export const OF_V2_NEUTRAL = 1.0;
/** Minimum comparable periods required for a "high" confidence result. */
export const OF_V2_MIN_HIGH_CONFIDENCE_COMPARABLES = 6;
/** Minimum comparable periods required for any non-neutral output. */
export const OF_V2_MIN_COMPARABLES = 3;
/** Smoothing weight applied to the raw ratio at the high-confidence band. */
export const OF_V2_SMOOTHING_HIGH = 1.0;
/** Smoothing weight applied at the medium-confidence band. */
export const OF_V2_SMOOTHING_MEDIUM = 0.6;
/** Smoothing weight applied at the low-confidence band. */
export const OF_V2_SMOOTHING_LOW = 0.3;

/* ──────────────────────────────────────────────────────────────────────── *
 * Types
 * ──────────────────────────────────────────────────────────────────────── */

export type OfBasis = "measured" | "derived" | "estimated" | "contextual";
export type OfConfidence = "high" | "medium" | "low";

/** A historical comparable period (one server-shift or one shift bucket). */
export interface OfHistoricalPeriod {
  /** ISO date or week_start. Used only to dedupe the scoring shift. */
  week_start: string;
  /** 0..6, Sunday=0 (whichever convention you use — be consistent). */
  day_of_week: number;
  /** "breakfast" | "lunch" | "dinner" | "late_night" etc. — venue's own. */
  daypart: string;
  /** Optional reliable outlet / revenue centre id. */
  outlet_id?: string | null;

  /** POS-measured. Net or gross is fine — basis is reported via sales_basis. */
  sales: number;
  /** "net" preferred; "gross" is allowed but downgrades confidence. */
  sales_basis: "net" | "gross";

  /** POS-measured check count. */
  checks: number;
  /** POS-measured covers; null if covers were not captured. */
  covers: number | null;
  /** True when covers came from a booking platform (estimated). */
  covers_from_bookings?: boolean;

  /** Labour paid hours. */
  labor_hours: number;
  /** True when labour hours were derived from rate × cost (estimated). */
  labor_hours_estimated?: boolean;

  /** Service hours actually worked (sum of clock spans). */
  service_hours: number;
}

/** The scoring shift we are evaluating opportunity for. */
export interface OfScoringShift {
  venue_id: string;
  week_start: string;
  day_of_week: number;
  daypart: string;
  outlet_id?: string | null;
  /** True if outlet/revenue centre import is verified as reliable. */
  outlet_reliable?: boolean;
  sales: number;
  sales_basis: "net" | "gross";
  checks: number;
  covers: number | null;
  covers_from_bookings?: boolean;
  labor_hours: number;
  labor_hours_estimated?: boolean;
  service_hours: number;
}

/**
 * Optional contextual signals an operator MIGHT pass in. These are
 * accepted by the API surface but never silently mixed into scoring.
 */
export interface OfContextInputs {
  sevenrooms_section?: string | null;
  table_allocation?: string | null;
  rota_section?: string | null;
  booking_type?: string | null;
  party_size?: number | null;
  walkin_vs_booking?: string | null;
  manager_notes?: string | null;
  weather?: string | null;
  /** Pass `true` for any of the above only when a downstream control has
   *  verified the field for this venue (e.g. POS imports SevenRooms
   *  section directly). Default false — keeps contextual out of scoring. */
  verified?: Partial<Record<
    | "sevenrooms_section"
    | "table_allocation"
    | "rota_section"
    | "booking_type"
    | "party_size"
    | "walkin_vs_booking",
    boolean
  >>;
}

export interface OpportunityFactorV2Result {
  opportunity_factor: number;
  confidence: OfConfidence;
  basis: OfBasis;
  inputs_used: string[];
  inputs_excluded: string[];
  warnings: string[];
  fallback_reason: string | null;
  explanation: string;
  /** Diagnostic — which comparison group level was used (1..5). */
  comparison_level: number;
  comparable_count: number;
}

/* ──────────────────────────────────────────────────────────────────────── *
 * Comparison group hierarchy
 * ──────────────────────────────────────────────────────────────────────── */

interface CompLevel {
  level: number;
  label: string;
  match: (p: OfHistoricalPeriod, s: OfScoringShift) => boolean;
}

const COMPARISON_LEVELS: CompLevel[] = [
  {
    level: 1,
    label: "venue + daypart + day-of-week + reliable outlet",
    match: (p, s) =>
      !!s.outlet_reliable &&
      !!s.outlet_id &&
      p.outlet_id === s.outlet_id &&
      p.daypart === s.daypart &&
      p.day_of_week === s.day_of_week,
  },
  {
    level: 2,
    label: "venue + daypart + day-of-week",
    match: (p, s) => p.daypart === s.daypart && p.day_of_week === s.day_of_week,
  },
  {
    level: 3,
    label: "venue + daypart",
    match: (p, s) => p.daypart === s.daypart,
  },
  {
    level: 4,
    label: "venue overall baseline",
    match: () => true,
  },
];

/* ──────────────────────────────────────────────────────────────────────── *
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  let s = 0;
  for (const r of rows) {
    const v = pick(r);
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Effective covers — POS first, check count fallback. */
function effectiveCovers(p: { covers: number | null; checks: number }): number {
  if (p.covers != null && p.covers > 0) return p.covers;
  return p.checks;
}

/* ──────────────────────────────────────────────────────────────────────── *
 * Contextual input scrubbing
 * ──────────────────────────────────────────────────────────────────────── */

/** Returns the contextual field names that were SUPPLIED but excluded from
 *  scoring (i.e. not explicitly verified). Always-excluded fields like
 *  weather/manager_notes are listed when supplied — they can never feed
 *  scoring, even if a caller marks them verified. */
export function excludedContextualInputs(ctx: OfContextInputs | undefined): string[] {
  if (!ctx) return [];
  const out: string[] = [];
  const verified = ctx.verified ?? {};
  const considerVerifiable = (
    key: keyof NonNullable<OfContextInputs["verified"]>,
    value: unknown,
  ) => {
    if (value == null || value === "") return;
    if (!verified[key]) out.push(key);
  };
  considerVerifiable("sevenrooms_section", ctx.sevenrooms_section);
  considerVerifiable("table_allocation", ctx.table_allocation);
  considerVerifiable("rota_section", ctx.rota_section);
  considerVerifiable("booking_type", ctx.booking_type);
  considerVerifiable("party_size", ctx.party_size);
  considerVerifiable("walkin_vs_booking", ctx.walkin_vs_booking);
  // Never-scoring fields:
  if (ctx.weather != null && ctx.weather !== "") out.push("weather");
  if (ctx.manager_notes != null && ctx.manager_notes !== "") out.push("manager_notes");
  return out;
}

/* ──────────────────────────────────────────────────────────────────────── *
 * Core engine
 * ──────────────────────────────────────────────────────────────────────── */

export interface ComputeOfV2Args {
  shift: OfScoringShift;
  history: OfHistoricalPeriod[];
  context?: OfContextInputs;
  /** Optional v1 fallback factor (Trading Pattern Factor v1) used when v2
   *  cannot compute safely. Defaults to neutral. */
  v1FallbackFactor?: number;
}

export function computeOpportunityFactorV2(
  args: ComputeOfV2Args,
): OpportunityFactorV2Result {
  const { shift, history, context } = args;
  const warnings: string[] = [];
  const inputs_used: string[] = [];
  const excluded_contextual = excludedContextualInputs(context);
  const inputs_excluded: string[] = [...excluded_contextual];

  // Always-trusted shift inputs.
  inputs_used.push(
    "pos_check_timestamp",
    "pos_sales",
    "pos_check_count",
    "labor_paid_hours",
    "derived_daypart",
    "derived_day_of_week",
    "venue_id",
  );

  if (shift.outlet_reliable && shift.outlet_id) {
    inputs_used.push("pos_outlet_id");
  } else if (shift.outlet_id) {
    inputs_excluded.push("pos_outlet_id_unverified");
  }

  // Covers vs check-count fallback.
  if (shift.covers != null && shift.covers > 0) {
    if (shift.covers_from_bookings) {
      inputs_used.push("covers_from_bookings");
      warnings.push("Covers were derived from bookings, not POS — confidence reduced.");
    } else {
      inputs_used.push("pos_covers");
    }
  } else {
    inputs_used.push("pos_check_count_as_covers_fallback");
    warnings.push("POS covers missing — using POS check count as a covers proxy.");
  }

  // Sales basis.
  if (shift.sales_basis === "gross") {
    warnings.push("Sales basis is gross — used as net would over/understate; confidence reduced.");
  }

  // Labour basis.
  if (shift.labor_hours_estimated) {
    warnings.push("Labour hours estimated from rate × cost — confidence reduced.");
  }

  if (excluded_contextual.length > 0) {
    warnings.push(
      `Contextual data not used for scoring (${excluded_contextual.join(", ")}). Section/rota/weather signals require verification before scoring.`,
    );
  }

  // Walk the comparison hierarchy.
  const baselinePool = history.filter(
    (p) =>
      p.week_start !== shift.week_start &&
      p.service_hours > 0 &&
      p.labor_hours > 0 &&
      p.sales > 0,
  );

  let chosen: { level: CompLevel; rows: OfHistoricalPeriod[] } | null = null;
  for (const lvl of COMPARISON_LEVELS) {
    const rows = baselinePool.filter((p) => lvl.match(p, shift));
    if (rows.length >= OF_V2_MIN_COMPARABLES) {
      chosen = { level: lvl, rows };
      break;
    }
  }

  // Venue-wide normal (for ratio denominator) — never group-of-one.
  const venueRows = baselinePool;

  if (!chosen || venueRows.length < OF_V2_MIN_COMPARABLES) {
    const fallback = clamp(
      typeof args.v1FallbackFactor === "number" && Number.isFinite(args.v1FallbackFactor)
        ? args.v1FallbackFactor
        : OF_V2_NEUTRAL,
      OF_V2_CLAMP_MIN,
      OF_V2_CLAMP_MAX,
    );
    return {
      opportunity_factor: fallback,
      confidence: "low",
      basis: "estimated",
      inputs_used,
      inputs_excluded,
      warnings: warnings.concat(
        "Insufficient comparable history — fell back to Trading Pattern Factor v1 / neutral.",
      ),
      fallback_reason: "insufficient_comparable_history",
      explanation:
        "Not enough comparable shifts in this venue's history to compute a trusted Opportunity Factor. Used the v1 Trading Pattern Factor (or neutral 1.0) with low confidence.",
      comparison_level: 0,
      comparable_count: chosen ? chosen.rows.length : 0,
    };
  }

  inputs_used.push("historical_venue_baseline", "comparable_window_baseline");
  if (chosen.level.level === 1) inputs_used.push("comparable_outlet");
  if (chosen.level.level <= 2) inputs_used.push("comparable_day_of_week");
  if (chosen.level.level <= 3) inputs_used.push("comparable_daypart");

  // Bucket metrics.
  const bucketSph = safeDiv(
    sum(chosen.rows, (r) => r.sales),
    sum(chosen.rows, (r) => r.service_hours),
  );
  const bucketCph = safeDiv(
    sum(chosen.rows, (r) => effectiveCovers(r)),
    sum(chosen.rows, (r) => r.service_hours),
  );
  const bucketSpc = safeDiv(
    sum(chosen.rows, (r) => r.sales),
    sum(chosen.rows, (r) => effectiveCovers(r)),
  );

  // Venue-normal metrics.
  const venueSph = safeDiv(
    sum(venueRows, (r) => r.sales),
    sum(venueRows, (r) => r.service_hours),
  );
  const venueCph = safeDiv(
    sum(venueRows, (r) => effectiveCovers(r)),
    sum(venueRows, (r) => r.service_hours),
  );
  const venueSpc = safeDiv(
    sum(venueRows, (r) => r.sales),
    sum(venueRows, (r) => effectiveCovers(r)),
  );

  const ratios: number[] = [];
  if (bucketSph != null && venueSph) ratios.push(bucketSph / venueSph);
  if (bucketCph != null && venueCph) ratios.push(bucketCph / venueCph);
  if (bucketSpc != null && venueSpc) ratios.push(bucketSpc / venueSpc);

  if (ratios.length < 2) {
    const fb = clamp(args.v1FallbackFactor ?? OF_V2_NEUTRAL, OF_V2_CLAMP_MIN, OF_V2_CLAMP_MAX);
    return {
      opportunity_factor: fb,
      confidence: "low",
      basis: "estimated",
      inputs_used,
      inputs_excluded,
      warnings: warnings.concat("Too few comparable ratios available — used fallback factor."),
      fallback_reason: "insufficient_comparable_ratios",
      explanation:
        "Comparable history was thin once denominators were checked. Fell back to a neutral / v1 factor with low confidence.",
      comparison_level: chosen.level.level,
      comparable_count: chosen.rows.length,
    };
  }

  const rawOf = ratios.reduce((s, r) => s + r, 0) / ratios.length;

  // Confidence band derived from comparable_count + warnings.
  let smoothing = OF_V2_SMOOTHING_LOW;
  let confidence: OfConfidence = "low";
  if (chosen.rows.length >= OF_V2_MIN_HIGH_CONFIDENCE_COMPARABLES) {
    smoothing = OF_V2_SMOOTHING_HIGH;
    confidence = "high";
  } else if (chosen.rows.length >= OF_V2_MIN_COMPARABLES + 1) {
    smoothing = OF_V2_SMOOTHING_MEDIUM;
    confidence = "medium";
  }
  // Downgrade if estimated-class warnings are present.
  const hasEstimatedWarning =
    shift.sales_basis === "gross" ||
    shift.labor_hours_estimated === true ||
    shift.covers_from_bookings === true ||
    (shift.covers == null || shift.covers <= 0);
  if (hasEstimatedWarning && confidence === "high") confidence = "medium";
  else if (hasEstimatedWarning && confidence === "medium") confidence = "low";

  const smoothed = 1 + (rawOf - 1) * smoothing;
  const opportunity_factor = clamp(smoothed, OF_V2_CLAMP_MIN, OF_V2_CLAMP_MAX);

  const basis: OfBasis = hasEstimatedWarning ? "estimated" : "derived";

  const explanation = [
    `Opportunity Factor based on POS check volume, POS sales volume, daypart and historical venue baseline.`,
    `Comparison group: ${chosen.level.label} (${chosen.rows.length} comparable periods).`,
    excluded_contextual.length > 0
      ? `Section / contextual data was not used because it is contextual or unverified.`
      : null,
    confidence !== "high" ? `Confidence ${confidence} — see warnings.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    opportunity_factor,
    confidence,
    basis,
    inputs_used,
    inputs_excluded,
    warnings,
    fallback_reason: null,
    explanation,
    comparison_level: chosen.level.level,
    comparable_count: chosen.rows.length,
  };
}

/* ──────────────────────────────────────────────────────────────────────── *
 * LLS integration helper (does NOT change the LLS formula)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Adjusted LLS = Base LLS ÷ Opportunity Factor.
 * Provided here so callers don't reinvent the math when wiring v2 in.
 */
export function adjustedLlsFromOpportunityFactor(
  baseLls: number,
  opportunityFactor: number,
): number {
  if (!Number.isFinite(baseLls) || !Number.isFinite(opportunityFactor) || opportunityFactor <= 0) {
    return baseLls;
  }
  return baseLls / opportunityFactor;
}
