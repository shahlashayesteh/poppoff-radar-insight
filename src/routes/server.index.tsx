import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { StatusCircle, StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { sarahCategories, statusColor, restaurant } from "@/lib/sample-data";
import { Sparkles, Flame, Trophy, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/server/")({
  component: ServerDashboard,
});

function ServerDashboard() {
  const focus = sarahCategories.find((c) => c.key === "wine")!;
  const strongest = sarahCategories.find((c) => c.key === "desserts")!;
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Sarah · {restaurant.week}</div>
        <h1 className="font-display text-3xl font-semibold mt-2 leading-tight">
          Your Popp Off stats just dropped <span className="inline-block">🟢</span>
        </h1>
      </div>

      {/* Hero focus card */}
      <div className="px-5 mt-5">
        <div className="rounded-3xl gradient-hero text-white p-6 relative overflow-hidden">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
            <Sparkles className="h-3 w-3" /> Weekly Focus
          </div>
          <p className="mt-4 text-lg leading-snug font-medium">
            This week try: increase wine confidence with seafood tables.
          </p>
          <p className="mt-3 text-sm text-white/70">
            Your strongest area is <span className="text-success font-medium">desserts</span>. Your biggest opportunity
            this week is <span className="text-white font-medium">wine</span>.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <Button size="sm" className="bg-success text-ink hover:bg-success/90 rounded-full">Acknowledge</Button>
            <Link to="/server/progress" className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1">
              Previous weeks <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Status circles */}
      <div className="px-5 mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">This week's stats</h2>
          <span className="text-xs text-muted-foreground">Percentage to personal target</span>
        </div>
        <div className="grid grid-cols-4 gap-y-6 gap-x-2">
          {sarahCategories.map((c) => (
            <StatusCircle key={c.key} status={c.status} label={c.name} score={c.score} size={68} />
          ))}
        </div>
      </div>

      {/* Hero category — Wine */}
      <div className="px-5 mt-8">
        <div className="rounded-2xl bg-white border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{focus.name}</div>
              <div className="mt-1 font-display text-xl font-semibold">Opportunity</div>
            </div>
            <StatusBadge status={focus.status} />
          </div>
          <p className="mt-3 text-sm text-foreground">{focus.message}</p>
          {focus.recommendation && (
            <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: "color-mix(in oklab, var(--success) 8%, white)", border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)" }}>
              <div className="text-xs font-medium text-success uppercase tracking-widest">Menu Recommendation</div>
              <p className="mt-2 text-sm">{focus.recommendation}</p>
            </div>
          )}
        </div>
      </div>

      {/* Strongest area */}
      <div className="px-5 mt-4">
        <div className="rounded-2xl bg-white border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{strongest.name}</div>
              <div className="mt-1 font-display text-xl font-semibold">Your strongest area</div>
            </div>
            <StatusBadge status={strongest.status}>Strong</StatusBadge>
          </div>
          <p className="mt-3 text-sm text-foreground">{strongest.message}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 mt-8">
        <h2 className="font-display text-lg font-semibold mb-3">Your progress</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-ink text-white p-4">
            <Flame className="h-5 w-5 text-warning" />
            <div className="mt-3 font-display text-3xl font-semibold">3</div>
            <div className="text-xs text-white/60 mt-1">Week streak</div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-4">
            <Trophy className="h-5 w-5 text-success" />
            <div className="mt-3 text-sm font-medium">Personal best</div>
            <div className="text-xs text-muted-foreground mt-1">Desserts hit green 4 weeks in a row</div>
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-white border border-border p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Popp Off Certified High Performer</span>
            <span className="text-muted-foreground">4 / 24 weeks</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: "16%", backgroundColor: statusColor("green") }} />
          </div>
        </div>
      </div>
    </ServerLayout>
  );
}
