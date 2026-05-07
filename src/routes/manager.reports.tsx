import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/manager/reports")({
  component: Reports,
});

function Reports() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-4xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Reports</h1>
        <div className="mt-8 rounded-2xl bg-white border border-border p-8 text-center text-sm text-muted-foreground">
          No reports yet. Reports will generate automatically once shift data exists.
        </div>
      </div>
    </ManagerLayout>
  );
}
