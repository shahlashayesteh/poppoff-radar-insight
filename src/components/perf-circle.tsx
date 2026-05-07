import { calculate_perf_colour_local } from "@/lib/perf";

type Props = { value: number; target: number; label: string; suffix?: string };

export function PerfCircle({ value, target, label, suffix = "" }: Props) {
  const colour = calculate_perf_colour_local(value, target);
  const bg =
    colour === "green" ? "var(--brand-green)" :
    colour === "amber" ? "var(--brand-orange)" :
    "var(--opportunity)";
  const display = Number.isFinite(value) ? value.toFixed(suffix === "%" ? 0 : suffix === "£" ? 2 : 1) : "—";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative h-24 w-24 rounded-full grid place-items-center text-white font-display font-extrabold"
        style={{
          background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${bg} 80%, white), ${bg})`,
          boxShadow: `0 10px 24px -10px ${bg}`,
        }}
      >
        <div className="text-center leading-tight">
          <div className="text-lg">{suffix === "£" ? "£" : ""}{display}{suffix === "%" ? "%" : ""}</div>
          <div className="text-[10px] font-medium opacity-90">/ {suffix === "£" ? "£" : ""}{target}{suffix === "%" ? "%" : ""}</div>
        </div>
      </div>
      <div className="text-xs font-semibold text-foreground text-center">{label}</div>
    </div>
  );
}
