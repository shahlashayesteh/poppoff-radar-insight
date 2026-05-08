import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";

export const Route = createFileRoute("/server/stats")({ component: Page });

function Page() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your stats will appear here after your manager uploads this week's data.</p>
      </div>
    </ServerLayout>
  );
}
