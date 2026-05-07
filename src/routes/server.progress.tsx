import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";

export const Route = createFileRoute("/server/progress")({
  component: ServerProgress,
});

function ServerProgress() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <div className="mt-8 rounded-2xl bg-white border border-border p-8 text-center">
          <div className="font-display font-bold">No data yet.</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Data will appear here once your team starts logging shifts.
          </p>
        </div>
      </div>
    </ServerLayout>
  );
}
