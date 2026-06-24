import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { getActiveVenueIdForUser } from "@/lib/active-venue";
import {
  loadServerPerformance,
  loadVenueLeaderboard,
  ragFromRing,
} from "@/lib/performance-engine";
import { getMondayOfWeek, toISODate, latestStatsWeek } from "@/lib/week";

export const Route = createFileRoute("/server/profile")({ component: Page });

type Milestone = { key: string; label: string; done: boolean };

function Page() {
  useRoleGate("server");
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [initial, setInitial] = useState("S");
  const [venueName, setVenueName] = useState("");
  const [currentStreak, setCurrentStreak] = useState(0);
  const [totalUplift, setTotalUplift] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const userId = u.user.id;

      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      const fullName = prof?.full_name || "";
      setName(fullName || "Server");
      setInitial((fullName.trim()[0] || "S").toUpperCase());

      const venueId = await getActiveVenueIdForUser(userId);
      if (!venueId) { setLoading(false); return; }

      const { data: ven } = await supabase
        .from("venues")
        .select("name")
        .eq("id", venueId)
        .maybeSingle();
      setVenueName(ven?.name ?? "");

      const weekStart = toISODate(getMondayOfWeek());
      const visibleWeek = await latestStatsWeek(
        supabase
          .from("server_stats")
          .select("week_start, created_at")
          .eq("user_id", userId)
          .eq("venue_id", venueId)
          .order("created_at", { ascending: false })
          .order("week_start", { ascending: false })
          .limit(1),
        weekStart,
      );

      const [{ data: sk }, { data: storedMs }, { data: weeksRows }, lb, currentPerf] = await Promise.all([
        supabase
          .from("server_streaks")
          .select("current_streak, longest_streak")
          .eq("user_id", userId)
          .eq("venue_id", venueId)
          .maybeSingle(),
        supabase
          .from("server_milestones")
          .select("milestone_type")
          .eq("user_id", userId)
          .eq("venue_id", venueId),
        supabase
          .from("server_stats")
          .select("week_start")
          .eq("user_id", userId)
          .eq("venue_id", venueId)
          .order("week_start", { ascending: false })
          .limit(12),
        loadVenueLeaderboard({ venueId, weekStart: visibleWeek }),
        loadServerPerformance({ venueId, userId, weekStart: visibleWeek }),
      ]);

      setCurrentStreak((sk as { current_streak?: number } | null)?.current_streak ?? 0);

      // Total uplift = sum of positive revenue influence across the most recent 12 logged weeks
      const weeks = (weeksRows ?? []).map((w) => String(w.week_start));
      const perfList = await Promise.all(
        weeks.map((w) =>
          w === visibleWeek
            ? Promise.resolve(currentPerf)
            : loadServerPerformance({ venueId, userId, weekStart: w }),
        ),
      );
      const uplift = perfList.reduce((sum, p) => {
        const wk = p.rows.reduce((s, r) => s + Math.max(0, r.revenueInfluence ?? 0), 0);
        return sum + wk;
      }, 0);
      setTotalUplift(Math.round(uplift));

      // Milestones — dynamic from engine + leaderboard + stored
      const storedSet = new Set<string>((storedMs ?? []).map((m) => String(m.milestone_type)));
      const rank = lb.find((r) => r.user_id === userId)?.rank ?? null;
      const greenByCat = (key: string) => {
        const row = currentPerf.rows.find((r) => r.key.toLowerCase().includes(key));
        return row ? ragFromRing(row.ringPct, row.target > 0) === "green" : false;
      };
      const everHitCat = (key: string): boolean =>
        perfList.some((p) =>
          p.rows.some((r) => r.key.toLowerCase().includes(key) && r.target > 0 && r.ringPct >= 90),
        );
      const dessertHit = everHitCat("dessert");
      const wineHit = everHitCat("wine");
      const cocktailHit = everHitCat("cocktail");

      const list: Milestone[] = [
        { key: "first_week", label: "First week logged", done: weeks.length >= 1 || storedSet.has("first_week_complete") },
        { key: "dessert", label: "Hit weekly dessert target", done: dessertHit || greenByCat("dessert") },
        { key: "streak_5", label: "5-week streak", done: ((sk as any)?.current_streak ?? 0) >= 5 || ((sk as any)?.longest_streak ?? 0) >= 5 || storedSet.has("streak_5") },
        { key: "top3", label: "Top 3 in venue leaderboard", done: rank !== null && rank <= 3 && lb.length >= 3 },
        { key: "wine", label: "Hit weekly wine target", done: wineHit || greenByCat("wine") },
        { key: "cocktail", label: "Hit weekly cocktail target", done: cocktailHit || greenByCat("cocktail") },
        { key: "uplift_500", label: "£500 lifetime uplift", done: uplift >= 500 },
        { key: "top1", label: "Top performer this week", done: rank === 1 && lb.length >= 2 },
      ];
      setMilestones(list);
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Profile</h1>

        {/* Profile card */}
        <div className="mt-6 rounded-2xl bg-white border border-border p-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-lg font-bold">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base truncate">{name || "—"}</div>
            <div className="text-xs text-muted-foreground truncate">
              {venueName ? `${venueName} · Server` : "Server"}
            </div>
          </div>
        </div>

        {/* Streak + Uplift */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-border p-4">
            <div className="text-xs text-muted-foreground">Current streak</div>
            <div className="font-display text-2xl font-extrabold mt-1">
              {currentStreak} week{currentStreak === 1 ? "" : "s"}
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-4">
            <div className="text-xs text-muted-foreground">Total uplift <span className="opacity-70">(modelled)</span></div>
            <div className="font-display text-2xl font-extrabold mt-1">
              {totalUplift === null ? "—" : `£${totalUplift}`}
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div className="mt-6 rounded-2xl bg-white border border-border p-5">
          <div className="font-display text-lg font-bold">Milestones</div>
          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {milestones.map((m) => (
                <li key={m.key} className="flex items-center gap-3 text-sm">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: m.done ? "var(--brand-green)" : "var(--muted-foreground)" }}
                  />
                  <span className={m.done ? "" : "text-muted-foreground"}>{m.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={signOut}
          className="mt-6 mb-6 rounded-xl border border-border px-4 py-2 text-sm font-semibold"
        >
          Sign out
        </button>
      </div>
    </ServerLayout>
  );
}
