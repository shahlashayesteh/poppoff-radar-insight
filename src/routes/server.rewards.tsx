import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { getActiveVenueIdForUser } from "@/lib/active-venue";
import { loadVenueLeaderboard, type LeaderboardRow } from "@/lib/performance-engine";
import { getMondayOfWeek, toISODate, latestStatsWeek } from "@/lib/week";
import { Flame, Trophy, Award, Sparkles, Lock, ChevronRight, Crown } from "lucide-react";

// Phase 10 — Server Rewards.
// Achievements, streaks, badges, personal bests and next unlock. Fun and
// motivational language only. No labour or manager-grade financial metrics.
export const Route = createFileRoute("/server/rewards")({ component: ServerRewards });

type Badge = {
  key: string;
  icon: string;
  title: string;
  hint: string;
  done: boolean;
  achievedLabel?: string;
};

function ServerRewards() {
  useRoleGate("server");
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [longest, setLongest] = useState(0);
  const [milestones, setMilestones] = useState<{ milestone_type: string; unlocked_at: string }[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [totalServers, setTotalServers] = useState<number>(0);
  const [weeksLogged, setWeeksLogged] = useState(0);
  const [topPersonalRank, setTopPersonalRank] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const v = await getActiveVenueIdForUser(u.user.id);
      if (!v) { setLoading(false); return; }
      const ws = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at")
          .eq("user_id", u.user.id).eq("venue_id", v)
          .order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        toISODate(getMondayOfWeek()),
      );
      const [sk, ms, weeks, lb] = await Promise.all([
        supabase.from("server_streaks").select("current_streak, longest_streak")
          .eq("user_id", u.user.id).eq("venue_id", v).maybeSingle(),
        supabase.from("server_milestones").select("milestone_type, unlocked_at")
          .eq("user_id", u.user.id).eq("venue_id", v).order("unlocked_at", { ascending: false }),
        supabase.from("server_stats").select("week_start")
          .eq("user_id", u.user.id).eq("venue_id", v),
        loadVenueLeaderboard({ venueId: v, weekStart: ws }),
      ]);
      const cur = ((sk.data as { current_streak?: number } | null)?.current_streak) ?? 0;
      const lng = ((sk.data as { longest_streak?: number } | null)?.longest_streak) ?? 0;
      setCurrent(cur);
      setLongest(lng);
      setMilestones((ms.data ?? []) as { milestone_type: string; unlocked_at: string }[]);
      const me = (lb as LeaderboardRow[]).find((r) => r.user_id === u.user!.id);
      setRank(me?.rank ?? null);
      setTotalServers(lb.length);
      setWeeksLogged((weeks.data ?? []).length);

      // Best personal rank ever: query best historical rank across server_stats weeks
      // is expensive; cheap proxy = current rank if it's the user's best on file
      // via server_milestones top_performer events.
      const personalBest = (ms.data ?? []).some((m) => m.milestone_type === "top_performer")
        ? 1
        : me?.rank ?? null;
      setTopPersonalRank(personalBest);
      setLoading(false);
    })();
  }, []);

  // Achievements / badges — derived locally so the page is never empty.
  const badges: Badge[] = (() => {
    const seen = new Set(milestones.map((m) => m.milestone_type));
    return [
      {
        key: "first_week",
        icon: "🎯",
        title: "First week",
        hint: "Get your first week of stats on the board.",
        done: weeksLogged >= 1 || seen.has("first_week_complete"),
        achievedLabel: weeksLogged >= 1 ? "Unlocked" : undefined,
      },
      {
        key: "streak_3",
        icon: "🔥",
        title: "3-week streak",
        hint: "Hit your targets three weeks in a row.",
        done: current >= 3 || longest >= 3,
      },
      {
        key: "streak_5",
        icon: "🚀",
        title: "5-week streak",
        hint: "Five weeks of staying on target.",
        done: current >= 5 || longest >= 5 || seen.has("streak_5"),
      },
      {
        key: "streak_10",
        icon: "🏅",
        title: "10-week streak",
        hint: "Ten weeks — that's elite consistency.",
        done: current >= 10 || longest >= 10 || seen.has("streak_10"),
      },
      {
        key: "top3",
        icon: "🥉",
        title: "Top 3 finish",
        hint: "Finish a week in your venue's top 3.",
        done: (rank !== null && rank <= 3 && totalServers >= 3) || seen.has("top_performer"),
      },
      {
        key: "top1",
        icon: "👑",
        title: "Number one",
        hint: "Hit #1 on the momentum board.",
        done: rank === 1 && totalServers >= 2,
      },
      {
        key: "personal_best",
        icon: "🏆",
        title: "Personal best",
        hint: "Set a new personal record on a category.",
        done: seen.has("personal_best"),
      },
    ];
  })();

  const earned = badges.filter((b) => b.done);
  const nextUnlock = badges.find((b) => !b.done) ?? null;

  return (
    <ServerLayout>
      <div className="px-5 pt-6 pb-10">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Rewards</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Your wins & streaks 🎉
        </h1>

        {/* Hero streak */}
        <div className="mt-5 rounded-3xl border-2 p-5 flex items-center gap-4"
          style={{
            borderColor: current > 0 ? "color-mix(in oklab, var(--brand-orange) 40%, transparent)" : "var(--border)",
            background: current > 0 ? "color-mix(in oklab, var(--brand-orange) 8%, white)" : "white",
          }}>
          <div className="h-16 w-16 rounded-full grid place-items-center"
            style={{ background: current > 0 ? "var(--brand-orange)" : "var(--muted)", color: "white" }}>
            <Flame className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: current > 0 ? "var(--brand-orange)" : "var(--muted-foreground)" }}>
              Current streak
            </div>
            <div className="font-display text-2xl font-extrabold leading-tight">
              {current} week{current === 1 ? "" : "s"} on target
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Personal best: {longest} week{longest === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-border p-3 text-center">
            <Trophy className="h-5 w-5 mx-auto" style={{ color: "var(--brand-green)" }} />
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Badges</div>
            <div className="font-display text-xl font-extrabold leading-none mt-1">{earned.length}</div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-3 text-center">
            <Award className="h-5 w-5 mx-auto" style={{ color: "var(--brand-orange)" }} />
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Best rank</div>
            <div className="font-display text-xl font-extrabold leading-none mt-1">
              {topPersonalRank !== null ? `#${topPersonalRank}` : "—"}
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-3 text-center">
            <Sparkles className="h-5 w-5 mx-auto" style={{ color: "var(--brand-green)" }} />
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Weeks logged</div>
            <div className="font-display text-xl font-extrabold leading-none mt-1">{weeksLogged}</div>
          </div>
        </div>

        {/* Next unlock */}
        {nextUnlock && (
          <div className="mt-5 rounded-3xl bg-white border-2 border-dashed p-5"
            style={{ borderColor: "color-mix(in oklab, var(--brand-green) 35%, transparent)" }}>
            <div className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--brand-green)" }}>
              <Lock className="h-3 w-3" /> Next unlock
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="text-3xl opacity-60">{nextUnlock.icon}</div>
              <div className="flex-1">
                <div className="font-display text-lg font-extrabold leading-tight">{nextUnlock.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{nextUnlock.hint}</div>
              </div>
            </div>
          </div>
        )}

        {/* Badges grid */}
        <h2 className="mt-6 font-display text-xl font-extrabold">Achievements</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading your wins…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {badges.map((b) => (
              <div key={b.key}
                className="rounded-2xl border p-4 flex flex-col items-center text-center"
                style={{
                  borderColor: b.done ? "color-mix(in oklab, var(--brand-green) 40%, transparent)" : "var(--border)",
                  background: b.done ? "color-mix(in oklab, var(--brand-green) 6%, white)" : "white",
                  opacity: b.done ? 1 : 0.7,
                }}>
                <div className="text-3xl">{b.done ? b.icon : "🔒"}</div>
                <div className="mt-1 font-semibold text-sm">{b.title}</div>
                <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{b.hint}</div>
                {b.done && (
                  <div className="mt-2 inline-block text-[10px] font-bold rounded-full px-2 py-0.5"
                    style={{ background: "var(--brand-green)", color: "white" }}>EARNED</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recent milestones */}
        {milestones.length > 0 && (
          <>
            <h2 className="mt-6 font-display text-xl font-extrabold">Recent milestones</h2>
            <div className="mt-3 space-y-2">
              {milestones.slice(0, 5).map((m, i) => (
                <div key={i} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
                  <Crown className="h-5 w-5" style={{ color: "var(--brand-orange)" }} />
                  <div className="flex-1">
                    <div className="font-semibold text-sm capitalize">{m.milestone_type.replaceAll("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(m.unlocked_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Quick link to leaderboard */}
        <div className="mt-6">
          <Link to="/server/leaderboard"
            className="rounded-2xl border border-border bg-white p-4 flex items-center gap-3">
            <Trophy className="h-5 w-5" style={{ color: "var(--brand-green)" }} />
            <div className="flex-1">
              <div className="font-semibold text-sm">See where you sit this week</div>
              <div className="text-xs text-muted-foreground">Open the momentum board</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </ServerLayout>
  );
}
