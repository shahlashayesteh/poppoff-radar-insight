export function calculate_perf_colour_local(actual: number, target: number): "red" | "amber" | "green" {
  if (!target || target === 0) return "amber";
  if (actual >= target) return "green";
  if (actual >= target * 0.8) return "amber";
  return "red";
}
