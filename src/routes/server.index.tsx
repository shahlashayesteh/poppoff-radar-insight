import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { StatTile } from "@/components/status";
import { weeklyStats, progressPct, thresholdStatus, coachingCards, leaderboard, yourHandle } from "@/lib/sample-data";
import { Bell, ChevronDown, ArrowRight, Sparkles, Trophy } from "lucide-react";

export const Route = createFileRoute("/server/")({
  component: ServerDashboard,
});

function ServerDashboard() {
  // Pick the weakest category as this week's focus
  const focus = [...weeklyStats].sort(
    (a, b) => progressPct(a.units, a.target) - progressPct(b.units, b.target)
  )[0];
  const focusCard = coachingCards.find((c) => c.key === focus.key) ?? coachingCards[0];
  const you = leaderboard.find((r) => r.isYou)!;

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xl">👋</span>
            <span className="font-medium">Hey Sarah!</span>
          </div>
          <button className="relative h-9 w-9 grid place-items-center rounded-full border border-border">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-orange" />
          </button>
        </div>

        <h1 className="mt-4 font-display text-[40px] leading-[1] font-extrabold tracking-tight">
          Stats just<br />
          <span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <button className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
          15th – 21st May 2025 <ChevronDown className="h-4 w-4" />
        </button>

        {/* Focus banner */}
        <Link
          to="/server/menu"
          className="mt-5 block rounded-3xl p-5 border-2 relative overflow-hidden"
          style={{
            borderColor: "color-mix(in oklab, var(--opportunity) 35%, transparent)",
            background: "color-mix(in oklab, var(--opportunity) 8%, white)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-opportunity">
                <Sparkles className="h-3.5 w-3.5" /> This week's focus
              </div>
              <div className="mt-2 font-display text-2xl font-extrabold leading-tight">
                Push {focus.label.toLowerCase().replace(" sold", "")} 🔥
              </div>
              <p className="mt-1 text-sm text-foreground/80">
                {focus.units} sold · {progressPct(focus.units, focus.target)}% of target. {focusCard.scripts[0]}
              </p>
            </div>
            <div className="text-4xl">{focus.emoji}</div>
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-opportunity">
            See coaching <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        {/* Numbers-first stats */}
        <div className="mt-5 flex items-center justify-between">
          <div className="font-semibold">Your numbers</div>
          <span className="text-[11px] text-muted-foreground">Below 60% = focus</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {weeklyStats.map((s) => (
            <StatTile key={s.key} stat={s} />
          ))}
        </div>

        {/* Leaderboard preview */}
        <Link
          to="/server/leaderboard"
          className="mt-5 block rounded-3xl bg-white border border-border p-4 flex items-center gap-3 hover:border-brand-orange transition"
        >
          <div className="h-11 w-11 rounded-full bg-brand-orange/15 grid place-items-center">
            <Trophy className="h-5 w-5 text-brand-orange" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">You're #{you.rank} of {leaderboard.length} this week</div>
            <div className="text-xs text-muted-foreground">Anonymous · you're {yourHandle}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        {/* Smart recs link */}
        <Link
          to="/server/welcome"
          className="mt-3 block rounded-3xl p-4 flex items-center gap-3"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", border: "1px solid color-mix(in oklab, var(--brand-green) 30%, transparent)" }}
        >
          <span className="text-2xl">📈</span>
          <div className="flex-1">
            <div className="text-sm font-bold">+£230 potential lift this week</div>
            <div className="text-xs text-muted-foreground">See your smart recs</div>
          </div>
          <ArrowRight className="h-4 w-4 text-brand-green" />
        </Link>
      </div>
    </ServerLayout>
  );
}
