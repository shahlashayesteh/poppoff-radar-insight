import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";

export const Route = createFileRoute("/server/welcome")({
  component: SmartRecs,
});

function SmartRecs() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Rewards</h1>
        <div className="mt-6 rounded-3xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">
          Complete your first week to unlock milestones.
        </div>
      </div>
    </ServerLayout>
  );
}
