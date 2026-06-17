// Opportunity Factor v2 — historical bucket vs venue normal, weighted + smoothed + clamped.
import { OF } from "./config";
import type { Daypart, DurationTier, HistoricalPeriod, OFComponents } from "./types";

function sum<T>(rows: T[], pick: (r: T) => number): number {
  let s = 0;
  for (const r of rows) s += pick(r);
  return s;
}

function safeRatio(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

function smoothingWeightFor(count: number): number {
  let w = 0;
  for (const tier of OF.smoothing) if (count >= tier.min) w = tier.weight;
  return w;
}

/** Filter to valid periods (non-blocked, non-held, denominators positive, target shift week excluded). */
export function filterBaselinePeriods(
  periods: HistoricalPeriod[],
  scoringWeekStart: string,
): HistoricalPeriod[] {
  return periods.filter(
    (p) =>
      p.week_start !== scoringWeekStart &&
      p.attribution_status !== "blocked" &&
      p.attribution_status !== "held_for_review" &&
      p.service_hours > 0 &&
      p.gross_sales > 0 &&
      p.covers > 0 &&
      p.labor_hours > 0,
  );
}

/**
 * Compute the System OF for a (venue, day_of_week, daypart, duration_tier) bucket
 * against the venue's "normal" trading metrics across the same baseline window.
 */
export function computeOpportunityFactor(
  bucket: { day_of_week: number; daypart: Daypart; duration_tier: DurationTier },
  baselinePeriods: HistoricalPeriod[],
): OFComponents {
  const bucketRows = baselinePeriods.filter(
    (p) =>
      p.day_of_week === bucket.day_of_week &&
      p.daypart === bucket.daypart &&
      p.duration_tier === bucket.duration_tier,
  );
  const comparable_count = bucketRows.length;

  if (comparable_count < OF.insufficientThreshold) {
    return {
      coi: null,
      rei: null,
      ldi: null,
      raw_of: null,
      smoothed_of: 1.0,
      system_of: 1.0,
      comparable_count,
      weights_used: { coi: 0, rei: 0, ldi: 0 },
    };
  }

  // Bucket metrics.
  const histCoversPerHr = safeRatio(
    sum(bucketRows, (r) => r.covers),
    sum(bucketRows, (r) => r.service_hours),
  );
  const histRpc = safeRatio(
    sum(bucketRows, (r) => r.gross_sales),
    sum(bucketRows, (r) => r.covers),
  );
  const histSplh = safeRatio(
    sum(bucketRows, (r) => r.gross_sales),
    sum(bucketRows, (r) => r.labor_hours),
  );

  // Venue normal metrics across all baseline periods.
  const venueCoversPerHr = safeRatio(
    sum(baselinePeriods, (r) => r.covers),
    sum(baselinePeriods, (r) => r.service_hours),
  );
  const venueRpc = safeRatio(
    sum(baselinePeriods, (r) => r.gross_sales),
    sum(baselinePeriods, (r) => r.covers),
  );
  const venueSplh = safeRatio(
    sum(baselinePeriods, (r) => r.gross_sales),
    sum(baselinePeriods, (r) => r.labor_hours),
  );

  const coi = histCoversPerHr != null && venueCoversPerHr ? histCoversPerHr / venueCoversPerHr : null;
  const rei = histRpc != null && venueRpc ? histRpc / venueRpc : null;
  const ldi = histSplh != null && venueSplh ? histSplh / venueSplh : null;

  // Weight redistribution across available components.
  const w = OF.componentWeights;
  const avail: Array<["coi" | "rei" | "ldi", number, number]> = [];
  if (coi != null) avail.push(["coi", coi, w.coi]);
  if (rei != null) avail.push(["rei", rei, w.rei]);
  if (ldi != null) avail.push(["ldi", ldi, w.ldi]);

  if (avail.length < 2) {
    return {
      coi,
      rei,
      ldi,
      raw_of: null,
      smoothed_of: 1.0,
      system_of: 1.0,
      comparable_count,
      weights_used: { coi: 0, rei: 0, ldi: 0 },
    };
  }

  const totalW = avail.reduce((s, [, , wt]) => s + wt, 0);
  const usedW = { coi: 0, rei: 0, ldi: 0 };
  let raw_of = 0;
  for (const [k, v, wt] of avail) {
    const adj = wt / totalW;
    usedW[k] = adj;
    raw_of += adj * v;
  }

  const sw = smoothingWeightFor(comparable_count);
  const smoothed_of = 1 + (raw_of - 1) * sw;
  const system_of = Math.min(OF.clampMax, Math.max(OF.clampMin, smoothed_of));

  return { coi, rei, ldi, raw_of, smoothed_of, system_of, comparable_count, weights_used: usedW };
}

export function durationTierFromHours(h: number): DurationTier {
  if (h < 4) return "short";
  if (h < 7) return "standard";
  return "long";
}
