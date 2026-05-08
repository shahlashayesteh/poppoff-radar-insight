import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/server/welcome")({ component: Welcome });

function Welcome() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-7 w-7 text-brand-orange shrink-0 mt-1" />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-extrabold tracking-tight leading-tight">Rewards & milestones</h1>
            <p className="mt-1 text-sm text-muted-foreground">Track streaks, personal bests, and team rankings.</p>
          </div>
        </div>
        <Link to="/server/progress" className="mt-6 block w-full rounded-2xl py-4 text-center font-display text-lg font-bold bg-brand-orange text-white">
          See your progress <ArrowRight className="inline h-5 w-5 ml-1" />
        </Link>
      </div>
    </ServerLayout>
  );
}
