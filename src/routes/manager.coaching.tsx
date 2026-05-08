import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/manager/coaching")({ component: Page });

function Page() {
  return (
    <ManagerLayout>
      <div className="px-8 py-10 max-w-5xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Coaching</h1>
        <p className="mt-2 text-sm text-muted-foreground">This week's pairings and priorities. Set them in Weekly Priorities to populate this view.</p>
      </div>
    </ManagerLayout>
  );
}
