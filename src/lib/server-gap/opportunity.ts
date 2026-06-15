// Opportunity Factor inference from actual shift start/end times only.
// Daypart labels are NEVER consulted for calculation.

export type Band = "Low" | "Normal" | "Strong" | "Peak" | "Mixed";

const BAND_MID: Record<Exclude<Band, "Mixed">, number> = {
  Low: 0.825, // 0.75–0.90
  Normal: 1.0, // 0.95–1.05
  Strong: 1.175, // 1.10–1.25
  Peak: 1.35, // 1.30–1.40
};

// Weekday: 0 = Sunday … 6 = Saturday.
// 24-hour-of-day band grid. Off-service hours = Low; lunch/dinner = Normal/Strong/Peak
// depending on the weekday. Tuned for full-service restaurants.
const GRID: Record<number, Band[]> = (() => {
  const fill = (lunch: Band, dinner: Band, brunch?: Band): Band[] => {
    const row: Band[] = Array(24).fill("Low");
    // brunch / lunch window 11:00 – 16:00
    for (let h = 11; h < 16; h++) row[h] = brunch ?? lunch;
    // shoulder 16:00 – 17:00
    row[16] = "Normal";
    // dinner window 17:00 – 22:00
    for (let h = 17; h < 22; h++) row[h] = dinner;
    // late 22:00 – 23:00 a notch down
    row[22] = dinner === "Peak" ? "Strong" : "Normal";
    return row;
  };
  return {
    0: fill("Strong", "Normal", "Strong"), // Sun
    1: fill("Low", "Normal"), // Mon
    2: fill("Low", "Normal"), // Tue
    3: fill("Normal", "Normal"), // Wed
    4: fill("Normal", "Strong"), // Thu
    5: fill("Strong", "Peak"), // Fri
    6: fill("Strong", "Peak", "Strong"), // Sat
  };
})();

function parseDate(d: string | Date): Date | null {
  if (d instanceof Date) return isNaN(+d) ? null : d;
  const s = String(d ?? "").trim();
  if (!s) return null;
  // Accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY (UK-leaning fallback).
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    // Assume DD/MM/YYYY first.
    const a = +m[1];
    const b = +m[2];
    if (a > 12) return new Date(y, b - 1, a);
    return new Date(y, b - 1, a);
  }
  const t = new Date(s);
  return isNaN(+t) ? null : t;
}

/** Parse a time string into minutes-since-midnight. Accepts "17:30", "5:30 PM", "1730". */
export function parseTime(t: string | number | null | undefined): number | null {
  if (t == null) return null;
  if (typeof t === "number") {
    // Excel serial fraction-of-day
    if (t >= 0 && t < 1) return Math.round(t * 24 * 60);
    if (t >= 0 && t < 24) return Math.round(t * 60);
    return null;
  }
  const s = String(t).trim();
  if (!s) return null;
  const ampm = /([ap])\.?m\.?/i.exec(s);
  const clean = s.replace(/[ap]\.?m\.?/i, "").trim();
  let m = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  let h: number;
  let min: number;
  if (m) {
    h = +m[1];
    min = +m[2];
  } else if ((m = clean.match(/^(\d{3,4})$/))) {
    const n = m[1].padStart(4, "0");
    h = +n.slice(0, 2);
    min = +n.slice(2);
  } else if ((m = clean.match(/^(\d{1,2})$/))) {
    h = +m[1];
    min = 0;
  } else return null;
  if (ampm) {
    const p = ampm[1].toLowerCase();
    if (p === "p" && h < 12) h += 12;
    if (p === "a" && h === 12) h = 0;
  }
  if (h < 0 || h > 24 || min < 0 || min >= 60) return null;
  return h * 60 + min;
}

export type FactorResult = {
  factor: number;
  band: Band;
  defaulted: boolean;
  estimated: boolean;
};

const DEFAULT: FactorResult = {
  factor: 1.0,
  band: "Normal",
  defaulted: true,
  estimated: false,
};

/**
 * Infer Opportunity Factor from actual shift times only.
 * - Both times present: minute-weighted average across the weekday's hour grid.
 * - Only start present: assume 4-hour shift, mark `estimated: true`.
 * - Otherwise: factor = 1.0, `defaulted: true`.
 */
export function resolveFactorFromTimes(
  date: string | Date,
  start: string | number | null | undefined,
  end: string | number | null | undefined,
): FactorResult {
  const dt = parseDate(date);
  if (!dt) return DEFAULT;
  const dow = dt.getDay();
  const grid = GRID[dow];

  let startMin = parseTime(start);
  let endMin = parseTime(end);
  let estimated = false;

  if (startMin == null && endMin == null) return DEFAULT;
  if (startMin == null && endMin != null) {
    startMin = Math.max(0, endMin - 240);
    estimated = true;
  } else if (endMin != null && endMin <= (startMin as number)) {
    // overnight shift — wrap to 24h
    endMin += 24 * 60;
  } else if (endMin == null) {
    endMin = (startMin as number) + 240;
    estimated = true;
  }

  const totalMin = (endMin as number) - (startMin as number);
  if (totalMin <= 0) return DEFAULT;

  const counts: Record<string, number> = {};
  let weightedSum = 0;
  for (let m = startMin as number; m < (endMin as number); m++) {
    const h = Math.floor(m / 60) % 24;
    const b = grid[h];
    counts[b] = (counts[b] ?? 0) + 1;
    weightedSum += BAND_MID[b as Exclude<Band, "Mixed">];
  }

  const factor = weightedSum / totalMin;

  let dominant: Band = "Normal";
  let bestCount = 0;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestCount) {
      bestCount = counts[k];
      dominant = k as Band;
    }
  }
  const band: Band = bestCount / totalMin >= 0.6 ? dominant : "Mixed";

  return {
    factor: Math.round(factor * 1000) / 1000,
    band,
    defaulted: false,
    estimated,
  };
}
