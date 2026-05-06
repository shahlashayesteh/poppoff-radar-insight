import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { Share2, Flame, Award, Rocket } from "lucide-react";

export const Route = createFileRoute("/server/progress")({
  component: ServerProgress,
});

const days = ["M", "T", "W", "T", "F", "S", "S"];
const done = [true, true, true, true, true, false, false];

function ServerProgress() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-brand-orange font-semibold">
            <Flame className="h-5 w-5" /> Current streak
          </div>
          <button className="h-9 w-9 rounded-full border border-border grid place-items-center text-brand-green">
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* Big streak circle */}
        <div className="mt-4 grid place-items-center">
          <div className="relative">
            {/* rays */}
            <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i / 12) * Math.PI * 2;
                const x1 = 100 + Math.cos(a) * 88;
                const y1 = 100 + Math.sin(a) * 88;
                const x2 = 100 + Math.cos(a) * 100;
                const y2 = 100 + Math.sin(a) * 100;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 ? "var(--brand-orange)" : "oklch(0.85 0.16 70)"} strokeWidth="6" strokeLinecap="round" />;
              })}
            </svg>
            <div className="h-48 w-48 rounded-full grid place-items-center"
              style={{ background: "radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--brand-orange) 20%, white), white 70%)" }}>
              <div className="text-center">
                <div className="font-display text-7xl font-extrabold text-brand-orange leading-none">12</div>
                <div className="mt-1 text-sm text-brand-orange font-semibold">days in a row!</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center">
          <div className="font-display text-lg font-bold">Keep it going, superstar! ⭐</div>
          <div className="text-sm text-muted-foreground mt-1">Consistency today, legendary results tomorrow.</div>
        </div>

        {/* Days strip */}
        <div className="mt-5 rounded-2xl bg-white border border-border p-3 grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="text-xs font-bold">{d}</div>
              <div className={`h-8 w-8 rounded-full grid place-items-center text-white ${done[i] ? "bg-brand-green" : "bg-muted text-muted-foreground"}`}>
                {done[i] ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>

        {/* Personal best */}
        <div className="mt-4 rounded-2xl bg-white border border-border p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full grid place-items-center bg-brand-orange/15">
            <Award className="h-7 w-7 text-brand-orange" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Personal best</div>
            <div className="font-display text-xl font-extrabold">12 days</div>
            <div className="text-xs text-brand-green font-medium">You're at your best! 🔥</div>
          </div>
        </div>

        {/* Daily goal */}
        <div className="mt-4 rounded-2xl bg-white border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Daily goal</div>
              <div className="font-display"><span className="text-2xl font-extrabold">£160</span> <span className="text-muted-foreground text-sm">/ £200</span></div>
            </div>
            <Rocket className="h-8 w-8" style={{ color: "oklch(0.55 0.18 270)" }} />
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-brand-green" style={{ width: "80%" }} />
          </div>
          <div className="mt-2 text-xs text-brand-green font-semibold">80% there – you've got this!</div>
        </div>

        {/* Smashed banner */}
        <div className="mt-4 rounded-2xl flex items-center gap-4 p-4"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", border: "1px solid color-mix(in oklab, var(--brand-green) 30%, transparent)" }}>
          <span className="text-3xl">💪</span>
          <div className="flex-1">
            <div className="font-display font-bold">You smashed it this week!</div>
            <div className="text-sm text-brand-green font-semibold mt-0.5">+18% vs last week</div>
          </div>
          <div className="h-9 w-9 rounded-full bg-brand-green text-white grid place-items-center">↗</div>
        </div>
      </div>
    </ServerLayout>
  );
}
