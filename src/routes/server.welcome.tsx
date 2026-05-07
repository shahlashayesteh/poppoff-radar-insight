import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/server/welcome")({
  component: SmartRecs,
});

function SmartRecs() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-7 w-7 text-brand-orange shrink-0 mt-1" />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-extrabold tracking-tight leading-tight">Rewards</h1>
            <p className="mt-1 text-sm text-muted-foreground">Personalised picks will appear here.</p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white border border-border p-8 text-center">
          <div className="font-display font-bold">No data yet.</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Data will appear here once your team starts logging shifts.
          </p>
        </div>

        <Link to="/server" className="mt-5 block w-full rounded-2xl py-4 text-center font-display text-lg font-bold bg-brand-orange text-white">
          Back to home
        </Link>
      </div>
    </ServerLayout>
  );
}
