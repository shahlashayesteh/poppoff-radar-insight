// Helpers around Monday-aligned week_start dates
export function getMondayOfWeek(d: Date = new Date()): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 sun .. 6 sat
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  return date;
}

export function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function previousMonday(d: Date): Date {
  const m = getMondayOfWeek(d);
  m.setDate(m.getDate() - 7);
  return m;
}

export function isMonday(d: Date) {
  return d.getDay() === 1;
}

export function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function performanceColour(actual: number, target: number): "green" | "amber" | "red" {
  if (!target) return "amber";
  const pct = (actual / target) * 100;
  if (pct >= 80) return "green";
  if (pct >= 55) return "amber";
  return "red";
}
