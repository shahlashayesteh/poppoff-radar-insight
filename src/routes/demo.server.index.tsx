import { createFileRoute, Link } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { Bell, ChevronDown, Trophy, Award, Flame, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/demo/server/")({
  component: ServerDashboard,
});

function Ring({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke={`color-mix(in oklab, ${color} 18%, white)`} strokeWidth="9" />
          <circle
            cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-2xl font-bold">{value}%</span>
        </div>
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
}

function ServerDashboard() {
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

        <h1 className="mt-4 font-display text-[44px] leading-[1] font-extrabold tracking-tight">
          Stats just<br />
          <span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <p className="mt-4 text-sm text-foreground/80">Here's how you crushed it</p>
        <button className="mt-1 inline-flex items-center gap-1 text-sm font-medium">
          15th – 21st May 2025 <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Top 3 rings */}
      <div className="px-5 mt-6">
        <div className="rounded-3xl bg-white border border-border p-5 shadow-sm">
          <div className="font-semibold">Your Top 3</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center">
              <div className="text-xs text-muted-foreground mb-2">Wine</div>
              <Ring value={78} color="var(--brand-orange)" label="" />
              <div className="mt-1 text-xs text-brand-green font-semibold">↑ +12%</div>
              <div className="text-[10px] text-muted-foreground">vs last week</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-muted-foreground mb-2">Cocktails</div>
              <Ring value={72} color="var(--brand-green)" label="" />
              <div className="mt-1 text-xs text-brand-green font-semibold">↑ +8%</div>
              <div className="text-[10px] text-muted-foreground">vs last week</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-muted-foreground mb-2">Desserts</div>
              <Ring value={64} color="oklch(0.82 0.16 80)" label="" />
              <div className="mt-1 text-xs text-brand-green font-semibold">↑ +18%</div>
              <div className="text-[10px] text-muted-foreground">vs last week</div>
            </div>
          </div>
        </div>
      </div>

      {/* Smashed it card */}
      <div className="px-5 mt-4">
        <div className="rounded-3xl border-2 p-5 flex items-center gap-4"
          style={{ borderColor: "color-mix(in oklab, var(--brand-green) 40%, transparent)", background: "color-mix(in oklab, var(--brand-green) 8%, white)" }}>
          <Trophy className="h-12 w-12 text-brand-green shrink-0" />
          <div className="flex-1">
            <div className="font-display text-lg font-bold leading-tight">
              You smashed <span className="text-brand-green">desserts</span> this week!
            </div>
            <div className="mt-1 text-xs"><span className="text-brand-green font-semibold">+18%</span> <span className="text-muted-foreground">vs last week</span></div>
          </div>
          <div className="h-9 w-9 rounded-full bg-brand-green text-white grid place-items-center text-sm">✓</div>
        </div>
      </div>

      {/* Daily Goal */}
      <div className="px-5 mt-4">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Daily Goal</div>
              <div className="mt-1 font-display"><span className="text-3xl font-extrabold">£160</span> <span className="text-muted-foreground text-sm">/ £200</span></div>
            </div>
            <Award className="h-10 w-10" style={{ color: "oklch(0.55 0.18 270)" }} />
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-brand-green" style={{ width: "80%" }} />
          </div>
          <div className="mt-2 text-xs text-brand-green font-semibold">80% of your goal</div>
        </div>
      </div>

      {/* Streak preview */}
      <div className="px-5 mt-4">
        <Link to="/server/progress" className="block rounded-3xl bg-white border border-border p-4 flex items-center gap-3 hover:border-brand-green transition">
          <div className="h-10 w-10 rounded-full bg-brand-orange/15 grid place-items-center">
            <Flame className="h-5 w-5 text-brand-orange" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Current streak: 12 days 🔥</div>
            <div className="text-xs text-muted-foreground">View milestones & rewards</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </ServerLayout>
  );
}
