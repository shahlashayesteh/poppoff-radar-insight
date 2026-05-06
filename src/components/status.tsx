import { Status, statusColor, deltaPct, progressPct, thresholdStatus, WeeklyStat } from "@/lib/sample-data";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";

export function DeltaChip({ value, suffix = "vs last week" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  const color = up ? "var(--success)" : "var(--opportunity)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}%<span className="font-medium opacity-70 ml-0.5">{suffix}</span>
    </span>
  );
}

export function StatTile({ stat }: { stat: WeeklyStat }) {
  const dPct = deltaPct(stat.units, stat.prevUnits);
  const pPct = progressPct(stat.units, stat.target);
  const status = thresholdStatus(pPct);
  const color = statusColor(status);
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: `color-mix(in oklab, ${color} 7%, white)`,
        borderColor: `color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="text-2xl">{stat.emoji}</div>
        <DeltaChip value={dPct} />
      </div>
      <div className="mt-2 font-display text-4xl font-extrabold leading-none" style={{ color }}>
        {stat.units}
      </div>
      <div className="mt-1 text-xs font-medium text-foreground/80">{stat.label} this week</div>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pPct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{pPct}% of target</span>
        <span>target {stat.target}</span>
      </div>
    </div>
  );
}

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn("inline-block rounded-full", className ?? "h-3 w-3")}
      style={{ backgroundColor: statusColor(status) }}
      aria-label={status}
    />
  );
}

export function StatusCircle({
  status,
  label,
  size = 96,
  score,
}: {
  status: Status;
  label: string;
  size?: number;
  score?: number;
}) {
  const color = statusColor(status);
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex items-center justify-center rounded-full text-white font-semibold"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${color} 80%, white), ${color})`,
          boxShadow: `0 10px 30px -10px ${color}, 0 0 0 6px color-mix(in oklab, ${color} 14%, transparent)`,
        }}
      >
        <span className="text-xl">{score ?? ""}</span>
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

export function StatusBadge({ status, children }: { status: Status; children?: React.ReactNode }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        color: status === "amber" ? "var(--ink)" : color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children ?? (status === "green" ? "Strong" : status === "amber" ? "Focus" : "Opportunity")}
    </span>
  );
}
