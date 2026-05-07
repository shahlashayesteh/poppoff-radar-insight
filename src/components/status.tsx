import { Status, statusColor } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

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
