import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { useRoleGate } from "@/lib/auth-gate";
import { Trophy, Flame, ChevronRight } from "lucide-react";

// Phase 1A stub: canonical /server/rewards route so the rewards link in the
// server experience resolves cleanly. Real rewards (streaks, milestones,
// unlockables, redemption flow) is scoped for Phase 10.
export const Route = createFileRoute("/server/rewards")({ component: ServerRewards });

function ServerRewards() {
  useRoleGate("server");
  return (
    <ServerLayout>
      <div className="px-6 py-10 max-w-2xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Rewards</div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">Your rewards</h1>
        <p className="mt-3 text-foreground/70">
          Streaks, milestones and unlockable perks will live here. We are wiring this surface up
          in the next release.
        </p>

        <div className="mt-8 grid sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5" style={{ color: "var(--brand-orange)" }} />
              <div className="font-semibold">Streak progress</div>
            </div>
            <p className="mt-2 text-sm text-foreground/70">Check your current streak on the Progress tab.</p>
            <Link to="/server/progress" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--brand-orange)" }}>
              Open Progress <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5" style={{ color: "var(--brand-green)" }} />
              <div className="font-semibold">Leaderboard</div>
            </div>
            <p className="mt-2 text-sm text-foreground/70">See where you sit on this week's momentum board.</p>
            <Link to="/server/leaderboard" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--brand-green)" }}>
              Open Leaderboard <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </ServerLayout>
  );
}
