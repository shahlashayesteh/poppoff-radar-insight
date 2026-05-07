import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/manager/priorities")({
  component: Priorities,
});

function Priorities() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Weekly Priorities</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">Weekly Priorities</h1>

        <div className="mt-8 rounded-2xl bg-white border border-border p-10 text-center">
          <div className="font-display font-bold">No data yet.</div>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Data will appear here once your team starts logging shifts.
          </p>
        </div>
      </div>
    </ManagerLayout>
  );
}
