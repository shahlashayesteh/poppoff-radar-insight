import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData } from "@/lib/server-data";
import { Flame, Award } from "lucide-react";

export const Route = createFileRoute("/server/progress")({ component: ServerProgress });

const ICONS: Record<string, string> = {
  first_week_complete: "🎯", streak_5: "🔥", streak_10: "🚀", personal_best: "🏆", top_performer: "⭐",
};
const LABELS: Record<string, string> = {
  first_week_complete: "First week complete", streak_5: "5-week streak", streak_10: "10-week streak",
  personal_best: "Personal best", top_performer: "Top performer (top 25%)",
};

function ServerProgress() {
  const [current, setCurrent] = useState(0);
  const [longest, setLongest] = useState(0);
  const [milestones, setMilestones] = useState<{ milestone_type: string; unlocked_at: string }[]>([]);
  const [position, setPosition] = useState<{ pos: number; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await claimServerCsvData();
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const venueId = vm?.[0]?.venue_id;
      if (!venueId) return;
      const { data: sk } = await supabase.from("server_streaks").select("current_streak, longest_streak").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setCurrent((sk as any)?.current_streak ?? 0);
      setLongest((sk as any)?.longest_streak ?? 0);
      const { data: ms } = await supabase.from("server_milestones").select("milestone_type, unlocked_at").eq("user_id", u.user.id).eq("venue_id", venueId).order("unlocked_at", { ascending: false });
      setMilestones((ms ?? []) as any);
      const today = new Date();
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
      const ws = monday.toISOString().slice(0, 10);
      const { data: lb } = await (supabase.rpc as any)("get_leaderboard_position", { _venue_id: venueId, _week_start: ws });
      const row = Array.isArray(lb) ? lb[0] : lb;
      if (row) setPosition({ pos: row.my_position, total: row.total_servers });
    })();
  }, []);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-center gap-2 text-brand-orange font-semibold">
          <Flame className="h-5 w-5" /> Current streak
        </div>
        <div className="mt-4 grid place-items-center">
          <div className="h-44 w-44 rounded-full grid place-items-center"
            style={{ background: "radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--brand-orange) 20%, white), white 70%)" }}>
            <div className="text-center">
              <div className="font-display text-7xl font-extrabold text-brand-orange leading-none">{current}</div>
              <div className="mt-1 text-sm text-brand-orange font-semibold">week{current === 1 ? "" : "s"} on target</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white border border-border p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full grid place-items-center bg-brand-orange/15"><Award className="h-7 w-7 text-brand-orange" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Personal best</div>
            <div className="font-display text-xl font-extrabold">{longest} week{longest === 1 ? "" : "s"}</div>
          </div>
        </div>

        <h2 className="mt-6 font-display text-xl font-extrabold">Milestones</h2>
        {milestones.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Complete a week of stats to unlock your first milestone.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
                <div className="text-2xl">{ICONS[m.milestone_type] || "🏅"}</div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{LABELS[m.milestone_type] || m.milestone_type}</div>
                  <div className="text-xs text-muted-foreground">{new Date(m.unlocked_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ServerLayout>
  );
}
