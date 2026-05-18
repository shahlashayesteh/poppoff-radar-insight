import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { Crown, Trophy, TrendingUp, Flame } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange } from "@/lib/week";
import {
  loadVenueLeaderboard,
  categoryLeaderboard,
  weeklyMovers,
  percentileRank,
  type LeaderboardRow,
} from "@/lib/performance-engine";

export const Route = createFileRoute("/server/leaderboard")({ component: Page });

type CatDef = { key: string; label: string };
type Streak = { user_id: string; current_streak: number; longest_streak: number };

function rankAccent(rank: number): { bg: string; fg: string } {
  if (rank === 1) return { bg: "var(--brand-green)", fg: "white" };
  if (rank === 2) return { bg: "color-mix(in oklab, var(--brand-green) 25%, white)", fg: "var(--brand-green)" };
  if (rank === 3) return { bg: "color-mix(in oklab, var(--brand-orange) 25%, white)", fg: "var(--brand-orange)" };
  return { bg: "var(--muted)", fg: "var(--muted-foreground)" };
}

function Page() {
  useRoleGate("server");
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [cats, setCats] = useState<CatDef[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overall");
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setMyId(u.user.id);
      // Merge any placeholder upload rows (created from CSV name matches) into
      // this signed-in server account so the leaderboard can show their position.
      try {
        await supabase.rpc("claim_placeholder_data" as never, {} as never);
      } catch (e) {
        console.warn("[leaderboard] claim_placeholder_data failed", e);
      }
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const v = vm?.[0]?.venue_id;
      if (!v) return;
      const { data: latest, error: latestErr } = await supabase.rpc("latest_venue_stats_week" as never, { p_venue_id: v } as never);
      if (latestErr) console.warn("[leaderboard] latest_venue_stats_week failed", latestErr);
      const visibleWeek = (latest as string | null) || weekStart;
      setDisplayWeekStart(visibleWeek);
      const [lb, vc, sk] = await Promise.all([
        loadVenueLeaderboard({ venueId: v, weekStart: visibleWeek }),
        supabase.from("venue_categories").select("key,label,sort_order").eq("venue_id", v).order("sort_order"),
        supabase.from("server_streaks").select("user_id,current_streak,longest_streak").eq("venue_id", v),
      ]);
      setBoard(lb);
      setCats((vc.data ?? []) as CatDef[]);
      setStreaks((sk.data ?? []) as Streak[]);
    })();
  }, [weekStart]);

  const total = board.length;
  const me = board.find((r) => r.user_id === myId) ?? null;
  const myPct = me ? percentileRank(me.rank, total) : null;
  const movers = useMemo(() => weeklyMovers(board, 3), [board]);
  const topStreak = useMemo(() => {
    const sorted = streaks.slice().sort((a, b) => b.current_streak - a.current_streak);
    return sorted[0]?.current_streak > 0 ? sorted[0] : null;
  }, [streaks]);
  const topStreakName = useMemo(() => {
    if (!topStreak) return null;
    return board.find((b) => b.user_id === topStreak.user_id)?.full_name ?? "Unknown";
  }, [topStreak, board]);

  const tabs = [{ key: "overall", label: "Overall" }, ...cats.map((c) => ({ key: c.key, label: c.label }))];
  const activeCat = cats.find((c) => c.key === activeTab) ?? null;
  const catBoard = activeCat ? categoryLeaderboard(board, activeCat.key, 999) : [];
  const overallBoard = board;

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Leaderboard</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Who's winning</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>

        {/* My rank hero */}
        {me && total > 1 && (
          <div
            className="mt-5 rounded-3xl border-2 p-5 flex items-center gap-4"
            style={{
              borderColor: me.rank === 1 ? "var(--brand-green)" : "color-mix(in oklab, var(--brand-orange) 35%, transparent)",
              background: me.rank === 1
                ? "color-mix(in oklab, var(--brand-green) 10%, white)"
                : "color-mix(in oklab, var(--brand-orange) 6%, white)",
            }}
          >
            <div className="h-16 w-16 rounded-full grid place-items-center shrink-0"
              style={{ background: me.rank === 1 ? "var(--brand-green)" : "var(--brand-orange)", color: "white" }}>
              {me.rank === 1 ? <Crown className="h-8 w-8" /> : <span className="font-display text-2xl font-extrabold">#{me.rank}</span>}
            </div>
            <div className="flex-1">
              <div className="font-display text-xl font-extrabold leading-tight">
                {me.rank === 1 ? "You're #1 this week" : `You're #${me.rank} of ${total}`}
              </div>
              {myPct !== null && me.rank !== 1 && (
                <div className="text-xs text-muted-foreground mt-0.5">Outperforming {myPct}% of the team</div>
              )}
              {me.movementPct !== null && (
                <div className="mt-1 text-sm font-semibold" style={{ color: me.movementPct >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                  {me.movementPct >= 0 ? "Up" : "Down"} {Math.abs(Math.round(me.movementPct))}% on your usual week
                </div>
              )}
            </div>
          </div>
        )}

        {/* Highlights row */}
        {(movers.length > 0 || topStreakName) && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {movers[0] && (
              <div
                className="rounded-2xl border-2 p-4"
                style={{
                  borderColor: "color-mix(in oklab, var(--brand-green) 35%, transparent)",
                  background: "color-mix(in oklab, var(--brand-green) 8%, white)",
                }}
              >
                <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand-green)" }}>
                  <TrendingUp className="h-3 w-3" /> Most improved
                </div>
                <div className="mt-1 font-display text-base font-extrabold leading-tight">{movers[0].full_name ?? "—"}</div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--brand-green)" }}>
                  Up {Math.round(movers[0].movementPct ?? 0)}% on usual
                </div>
              </div>
            )}
            {topStreakName && topStreak && (
              <div
                className="rounded-2xl border-2 p-4"
                style={{
                  borderColor: "color-mix(in oklab, var(--brand-orange) 35%, transparent)",
                  background: "color-mix(in oklab, var(--brand-orange) 8%, white)",
                }}
              >
                <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand-orange)" }}>
                  <Flame className="h-3 w-3" /> Longest streak
                </div>
                <div className="mt-1 font-display text-base font-extrabold leading-tight">{topStreakName}</div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--brand-orange)" }}>
                  {topStreak.current_streak} week{topStreak.current_streak === 1 ? "" : "s"} hot 🔥
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        {total > 0 && (
          <div className="mt-5 -mx-5 px-5 overflow-x-auto">
            <div className="flex gap-2 min-w-min">
              {tabs.map((t) => {
                const active = t.key === activeTab;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap"
                    style={{
                      background: active ? "var(--brand-green)" : "color-mix(in oklab, var(--brand-green) 8%, white)",
                      color: active ? "white" : "var(--brand-green)",
                      border: active ? "none" : "1px solid color-mix(in oklab, var(--brand-green) 25%, transparent)",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Board */}
        <div className="mt-4 rounded-3xl bg-white border border-border overflow-hidden">
          {total === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No leaderboard data for this week yet.</div>
          ) : activeTab === "overall" ? (
            <ul className="divide-y divide-border">
              {overallBoard.map((r) => {
                const accent = rankAccent(r.rank);
                const isMe = r.user_id === myId;
                return (
                  <li key={r.user_id} className="flex items-center gap-3 px-4 py-3"
                    style={{ background: isMe ? "color-mix(in oklab, var(--brand-green) 6%, white)" : undefined }}>
                    <div className="h-9 w-9 rounded-full grid place-items-center font-bold text-sm"
                      style={{ background: accent.bg, color: accent.fg }}>
                      {r.rank === 1 ? <Trophy className="h-4 w-4" /> : `#${r.rank}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-sm">{r.full_name ?? "Unnamed"}{isMe ? " (you)" : ""}</div>
                      {r.movementPct !== null && (
                        <div className="text-[11px] font-medium" style={{ color: r.movementPct >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                          {r.movementPct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(r.movementPct))}% on usual
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-base font-extrabold">£{Math.round(r.current_sales)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">sales</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : catBoard.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No {activeCat?.label} sales recorded for this week yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {catBoard.map((r, idx) => {
                const rank = idx + 1;
                const accent = rankAccent(rank);
                const isMe = r.user_id === myId;
                return (
                  <li key={r.user_id} className="flex items-center gap-3 px-4 py-3"
                    style={{ background: isMe ? "color-mix(in oklab, var(--brand-green) 6%, white)" : undefined }}>
                    <div className="h-9 w-9 rounded-full grid place-items-center font-bold text-sm"
                      style={{ background: accent.bg, color: accent.fg }}>
                      {rank === 1 ? <Trophy className="h-4 w-4" /> : `#${rank}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-sm">{r.full_name ?? "Unnamed"}{isMe ? " (you)" : ""}</div>
                      {r.catQty !== null && r.catQty > 0 && (
                        <div className="text-[11px] text-muted-foreground">{r.catQty} sold</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-base font-extrabold">£{Math.round(r.catSales)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{activeCat?.label}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 mb-8 text-[11px] text-muted-foreground text-center">
          Live ranking — automatically updated from your venue's sales data each week.
        </p>
      </div>
    </ServerLayout>
  );
}
