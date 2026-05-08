import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/manager/reports")({ component: Page });

function Page() {
  return (
    <ManagerLayout>
      <div className="px-8 py-10 max-w-5xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">No reports yet. Reports will generate automatically once shift data exists.</p>
      </div>
    </ManagerLayout>
  );
}
