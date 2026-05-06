import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { StatTile } from "@/components/status";
import { weeklyStats, deltaPct } from "@/lib/sample-data";
import { Share2, Flame, Award } from "lucide-react";

export const Route = createFileRoute("/server/progress")({
  component: ServerProgress,
});

const days = ["M", "T", "W", "T", "F", "S", "S"];
const done = [true, true, true, true, true, false, false];

function Spark({ units, prev }: { units: number; prev: number }) {
  // simple two-bar comparison
  const max = Math.max(units, prev, 1);
  return (
    <div className="flex items-end gap-1 h-6">
      <div className="w-2 rounded-sm bg-muted" style={{ height: `${(prev / max) * 100}%` }} />
      <div className="w-2 rounded-sm bg-brand-orange" style={{ height: `${(units / max) * 100}%` }} />
    </div>
  );
}

function ServerProgress() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-brand-orange font-semibold">
            <Flame className="h-5 w-5" /> 12-day streak
          </div>
          <button className="h-9 w-9 rounded-full border border-border grid place-items-center text-brand-green">
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Your stats</h1>
        <p className="text-sm text-muted-foreground">15th – 21st May · numbers below 60% need focus</p>

        {/* Days strip */}
        <div className="mt-4 rounded-2xl bg-white border border-border p-3 grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="text-xs font-bold">{d}</div>
              <div className={`h-8 w-8 rounded-full grid place-items-center text-white text-xs ${done[i] ? "bg-brand-green" : "bg-muted text-muted-foreground"}`}>
                {done[i] ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>

        {/* Stat tiles */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {weeklyStats.map((s) => (
            <StatTile key={s.key} stat={s} />
          ))}
        </div>

        {/* Week-over-week table */}
        <div className="mt-5 rounded-2xl bg-white border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm">Week vs last week</div>
          {weeklyStats.map((s) => {
            const d = deltaPct(s.units, s.prevUnits);
            return (
              <div key={s.key} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-border">
                <span className="text-xl">{s.emoji}</span>
                <div className="flex-1 text-sm font-medium">{s.label}</div>
                <Spark units={s.units} prev={s.prevUnits} />
                <div className="w-14 text-right">
                  <div className="font-display font-extrabold text-base leading-none">{s.units}</div>
                  <div className={`text-[10px] font-bold ${d >= 0 ? "text-brand-green" : "text-opportunity"}`}>
                    {d >= 0 ? "↑" : "↓"} {Math.abs(d)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Personal best */}
        <div className="mt-5 mb-2 rounded-2xl bg-white border border-border p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full grid place-items-center bg-brand-orange/15">
            <Award className="h-7 w-7 text-brand-orange" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Personal best streak</div>
            <div className="font-display text-xl font-extrabold">12 days</div>
            <div className="text-xs text-brand-green font-medium">You're at your best 🔥</div>
          </div>
        </div>
      </div>
    </ServerLayout>
  );
}
