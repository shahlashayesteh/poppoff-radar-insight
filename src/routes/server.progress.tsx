import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { StatusDot } from "@/components/status";

export const Route = createFileRoute("/server/progress")({
  component: ServerProgress,
});

const weeks = [
  { week: "27 Apr – 3 May", focus: "Wine", outcome: "amber" as const },
  { week: "20 Apr – 26 Apr", focus: "Sides", outcome: "green" as const },
  { week: "13 Apr – 19 Apr", focus: "Desserts", outcome: "green" as const },
  { week: "6 Apr – 12 Apr", focus: "Bottled Water", outcome: "amber" as const },
];

function ServerProgress() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-2xl font-semibold">Progress</h1>
        <p className="text-sm text-muted-foreground mt-1">Your weekly focus history.</p>

        <div className="mt-5 space-y-2">
          {weeks.map((w) => (
            <div key={w.week} className="rounded-2xl bg-white border border-border p-4 flex items-center gap-4">
              <StatusDot status={w.outcome} className="h-3 w-3" />
              <div className="flex-1">
                <div className="text-sm font-medium">{w.focus}</div>
                <div className="text-xs text-muted-foreground">{w.week}</div>
              </div>
              <span className="text-xs text-muted-foreground capitalize">{w.outcome}</span>
            </div>
          ))}
        </div>
      </div>
    </ServerLayout>
  );
}
