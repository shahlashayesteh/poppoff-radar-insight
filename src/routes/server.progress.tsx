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
        <div className="mt-6 rounded-3xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">
          Your stats will appear here after your manager uploads this week's data.
        </div>
        <div className="mt-4 rounded-3xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">
          Your streak starts when you hit your first weekly target.
        </div>
      </div>
    </ServerLayout>
  );
}
