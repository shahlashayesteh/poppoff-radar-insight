import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { claimServerCsvData } from "@/lib/server-data";
import { Trophy, Award, Flame, ArrowRight } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour } from "@/lib/week";

export const Route = createFileRoute("/server/")({ component: ServerDashboard });

type Stat = {
  user_id: string; venue_id: string; week_start: string;
  total_covers: number; total_sales: number; spend_per_cover: number | null;
  wine_conversion: number | null; dessert_conversion: number | null; cocktail_conversion: number | null;
  sides_conversion: number | null; spirits_conversion: number | null; sparkling_conversion: number | null;
};
type Targets = {
  spend_per_cover_target: number;
  wine_target: number; dessert_target: number; cocktail_target: number;
  sides_target: number; spirits_target: number; sparkling_target: number;
  daily_sales_target: number;
};

function Ring({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke={`color-mix(in oklab, ${color} 18%, white)`} strokeWidth="9" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-xl font-bold">{Math.round(value)}%</span>
        </div>
      </div>
      <div className="text-xs font-semibold">{label}</div>
    </div>
  );
}

function ServerDashboard() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [stat, setStat] = useState<Stat | null>(null);
  const [target, setTarget] = useState<Targets | null>(null);
  const [streak, setStreak] = useState(0);
  const weekStart = toISODate(getMondayOfWeek());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      const fn = prof?.full_name || "";
      setName(fn.split(" ")[0] || "there");
      await claimServerCsvData();
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const venueId = vm?.[0]?.venue_id;
      if (!venueId) return;
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).eq("week_start", weekStart).maybeSingle();
      setStat(st as Stat | null);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setTarget(tg as Targets | null);
      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setStreak((sk as any)?.current_streak ?? 0);
      // Track view
      await supabase.from("server_stat_views").insert({ user_id: u.user.id, venue_id: venueId, week_start: weekStart });
    })();
  }, [weekStart]);

  const wine = Number(stat?.wine_conversion ?? 0);
  const cocktails = Number(stat?.cocktail_conversion ?? 0);
  const desserts = Number(stat?.dessert_conversion ?? 0);
  const dailySales = Number(stat?.total_sales ?? 0);
  const dailyTarget = Number(target?.daily_sales_target ?? 200);
  const dailyPct = Math.min(100, dailyTarget > 0 ? (dailySales / dailyTarget) * 100 : 0);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-sm flex items-center gap-2"><span className="text-xl">👋</span><span className="font-medium">Hey {name || "there"}!</span></div>
        <h1 className="mt-4 font-display text-[40px] leading-[1] font-extrabold tracking-tight">
          Stats just<br /><span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <div className="mt-3 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>
      </div>

      <div className="px-5 mt-5">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">Your Top 3</div>
          {stat ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Ring value={wine} color="var(--brand-orange)" label="Wine" />
              <Ring value={cocktails} color="var(--brand-green)" label="Cocktails" />
              <Ring value={desserts} color="oklch(0.82 0.16 80)" label="Desserts" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No stats for this week yet. Your manager will upload them after service.</p>
          )}
        </div>
      </div>

      {stat && target && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl bg-white border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">Sales this week</div>
                <div className="mt-1 font-display"><span className="text-3xl font-extrabold">£{dailySales.toFixed(0)}</span> <span className="text-muted-foreground text-sm">/ £{dailyTarget}</span></div>
              </div>
              <Award className="h-10 w-10" style={{ color: "oklch(0.55 0.18 270)" }} />
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-brand-green" style={{ width: `${dailyPct}%` }} />
            </div>
            <div className="mt-2 text-xs text-brand-green font-semibold">{Math.round(dailyPct)}% of your goal</div>
          </div>
        </div>
      )}

      <div className="px-5 mt-4">
        <Link to="/server/progress" className="block rounded-3xl bg-white border border-border p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-orange/15 grid place-items-center"><Flame className="h-5 w-5 text-brand-orange" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Current streak: {streak} week{streak === 1 ? "" : "s"} 🔥</div>
            <div className="text-xs text-muted-foreground">View milestones & rewards</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      <div className="px-5 mt-4">
        <Link to="/server/menu" className="block rounded-3xl border-2 p-4 flex items-center gap-3"
          style={{ borderColor: "color-mix(in oklab, var(--brand-green) 40%, transparent)", background: "color-mix(in oklab, var(--brand-green) 8%, white)" }}>
          <Trophy className="h-8 w-8 text-brand-green" />
          <div className="flex-1">
            <div className="font-display font-bold">This week's coaching</div>
            <div className="text-xs text-muted-foreground">See what your venue wants you to push</div>
          </div>
          <ArrowRight className="h-4 w-4 text-brand-green" />
        </Link>
      </div>
    </ServerLayout>
  );
}
