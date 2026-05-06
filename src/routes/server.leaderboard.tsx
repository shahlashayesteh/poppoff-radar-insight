import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { leaderboard, leaderboardCategories, yourHandle } from "@/lib/sample-data";
import { Lock, Crown, Medal, ArrowUp, ArrowDown, Minus } from "lucide-react";

export const Route = createFileRoute("/server/leaderboard")({
  component: Leaderboard,
});

function RankDelta({ d }: { d: number }) {
  if (d === 0) return <span className="inline-flex items-center text-muted-foreground text-[11px] gap-0.5"><Minus className="h-3 w-3" /></span>;
  const up = d > 0;
  return (
    <span className={`inline-flex items-center text-[11px] font-bold gap-0.5 ${up ? "text-brand-green" : "text-opportunity"}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(d)}
    </span>
  );
}

function Leaderboard() {
  const [tab, setTab] = useState<string>("overall");
  const you = leaderboard.find((r) => r.isYou)!;
  const sorted =
    tab === "overall"
      ? leaderboard
      : [...leaderboard]
          .sort((a, b) => (b.perCategory[tab] ?? 0) - (a.perCategory[tab] ?? 0))
          .map((r, i) => ({ ...r, rank: i + 1 }));
  const podium = sorted.slice(0, 3);
  const youRanked = sorted.find((r) => r.isYou)!;

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Names are hidden. Only you see your handle.
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">15th – 21st May · {leaderboard.length} servers</p>

        {/* Your rank hero */}
        <div
          className="mt-5 rounded-3xl p-5 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, var(--brand-orange), oklch(0.7 0.2 40))" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider opacity-90">Your rank</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-6xl font-extrabold leading-none">#{youRanked.rank}</span>
            <span className="text-sm opacity-90 mb-1">of {sorted.length}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="font-semibold">{yourHandle}</span>
            <span className="opacity-80">·</span>
            <RankDelta d={you.delta} />
            <span className="opacity-80 text-xs">vs last week</span>
          </div>
          <div className="mt-3 flex gap-4 text-xs">
            <div><div className="opacity-80">Score</div><div className="font-bold text-base">{you.score}</div></div>
            <div><div className="opacity-80">SPC</div><div className="font-bold text-base">£{you.spc}</div></div>
            <div><div className="opacity-80">Covers</div><div className="font-bold text-base">{you.covers}</div></div>
          </div>
          <Crown className="absolute right-4 top-4 h-10 w-10 opacity-20" />
        </div>

        {/* Category tabs */}
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {[{ key: "overall", label: "Overall" }, ...leaderboardCategories].map((c) => {
            const active = tab === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setTab(c.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold border ${
                  active ? "bg-ink text-white border-ink" : "bg-white text-foreground/70 border-border"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Podium */}
        <div className="mt-4 grid grid-cols-3 gap-2 items-end">
          {[podium[1], podium[0], podium[2]].map((p, idx) => {
            const place = idx === 0 ? 2 : idx === 1 ? 1 : 3;
            const heights = { 1: "h-28", 2: "h-20", 3: "h-16" } as const;
            const colors = { 1: "var(--brand-orange)", 2: "oklch(0.78 0.02 90)", 3: "oklch(0.7 0.08 50)" } as const;
            return (
              <div key={p.handle + place} className="flex flex-col items-center gap-2">
                <div className="text-[11px] font-semibold text-center truncate w-full">
                  {p.isYou ? `${p.handle} (you)` : p.handle}
                </div>
                <div className="text-xs text-muted-foreground">{p.score}</div>
                <div
                  className={`${heights[place as 1 | 2 | 3]} w-full rounded-t-2xl grid place-items-center text-white font-display font-extrabold text-xl`}
                  style={{ background: colors[place as 1 | 2 | 3], outline: p.isYou ? "3px solid var(--brand-orange)" : "none" }}
                >
                  {place === 1 ? <Crown className="h-6 w-6" /> : <Medal className="h-5 w-5" />}
                  <span className="ml-1">{place}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full ranked list */}
        <div className="mt-5 rounded-2xl bg-white border border-border overflow-hidden">
          {sorted.map((r) => {
            const value = tab === "overall" ? r.score : r.perCategory[tab] ?? 0;
            return (
              <div
                key={r.handle}
                className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-border ${
                  r.isYou ? "bg-brand-orange/10" : ""
                }`}
              >
                <div className={`w-7 text-center font-display font-extrabold ${r.rank <= 3 ? "text-brand-orange" : "text-muted-foreground"}`}>
                  {r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {r.isYou ? <>{r.handle} <span className="text-brand-orange">(you)</span></> : r.handle}
                  </div>
                  <div className="text-[11px] text-muted-foreground">£{r.spc} SPC · {r.covers} covers</div>
                </div>
                <RankDelta d={r.delta} />
                <div className="w-12 text-right font-display font-extrabold">{value}</div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 mb-2 text-[11px] text-center text-muted-foreground">
          Rankings reset every Monday. Keep pushing 🔥
        </p>
      </div>
    </ServerLayout>
  );
}
