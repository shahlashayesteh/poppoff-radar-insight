import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { useRoleGate } from "@/lib/auth-gate";
import { Sparkles, ChevronRight } from "lucide-react";

// Phase 1A stub: canonical /server/coaching route so navigation never 404s.
// The real coaching surface (approved priorities, personalised tips, focus
// acknowledgement) lands in Phase 10 — Server Pages Upgrade.
export const Route = createFileRoute("/server/coaching")({ component: ServerCoaching });

function ServerCoaching() {
  useRoleGate("server");
  return (
    <ServerLayout>
      <div className="px-6 py-10 max-w-2xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Coaching</div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">Your coaching</h1>
        <p className="mt-3 text-foreground/70">
          Approved focus items, personalised tips and pre-shift recommendations from your manager
          will appear here. We are wiring this surface up in the next release.
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-white p-6 flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)" }}>
            <Sparkles className="h-5 w-5" style={{ color: "var(--brand-green)" }} />
          </span>
          <div className="flex-1">
            <div className="font-semibold">In the meantime</div>
            <p className="mt-1 text-sm text-foreground/70">
              Your Smart Recs already include pairing suggestions tailored to your category mix.
            </p>
            <Link to="/server/welcome" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--brand-green)" }}>
              Open Smart Recs <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </ServerLayout>
  );
}
