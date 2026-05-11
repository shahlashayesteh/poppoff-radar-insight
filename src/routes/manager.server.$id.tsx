import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";
import { fetchCategoriesForWeek, fetchCategoryStatsForUser, type VenueCategory, type CategoryStat } from "@/lib/categories";

export const Route = createFileRoute("/manager/server/$id")({ component: ServerView });

function ServerView() {
  const { id } = Route.useParams();
  const [name, setName] = useState("");
  const [stat, setStat] = useState<any>(null);
  const [target, setTarget] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [viewed, setViewed] = useState(false);
  const [acked, setAcked] = useState(false);
  const [logins, setLogins] = useState(0);
  const [categories, setCategories] = useState<VenueCategory[]>([]);
  const [catStats, setCatStats] = useState<Record<string, CategoryStat>>({});
  const [catTargets, setCatTargets] = useState<Record<string, number>>({});
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
      setName(prof?.full_name || "Server");
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("user_id", id).eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setDisplayWeekStart(visibleWeek);
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle();
      setStat(st);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", id).eq("venue_id", v).maybeSingle();
      setTarget(tg);
      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", id).eq("venue_id", v).maybeSingle();
      setStreak((sk as any)?.current_streak ?? 0);
      const { data: vw } = await supabase.from("server_stat_views").select("id").eq("user_id", id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle();
      setViewed(!!vw);
      const { data: ak } = await supabase.from("server_focus_acks").select("id").eq("user_id", id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle();
      setAcked(!!ak);
      const { count: lc } = await supabase.from("server_logins").select("id", { count: "exact", head: true }).eq("user_id", id).eq("venue_id", v);
      setLogins(lc ?? 0);

      const vcats = await fetchVenueCategories(v);
      setCategories(vcats);
      const cs = await fetchCategoryStatsForUser(v, id, visibleWeek);
      setCatStats(Object.fromEntries(cs.map((r) => [r.category_key, r])));
      const { data: ct } = await (supabase as any).from("server_category_targets").select("category_key, target").eq("venue_id", v).eq("user_id", id);
      setCatTargets(Object.fromEntries((ct ?? []).map((r: any) => [r.category_key, Number(r.target) || 0])));
    })();
  }, [id, weekStart]);

  const hasCatStats = Object.keys(catStats).length > 0;

  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <Link to="/manager" className="text-sm text-muted-foreground hover:text-foreground">← Back to dashboard</Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Server</div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight mt-1">{name}</h1>
            <div className="text-xs text-muted-foreground mt-1">{formatWeekRange(displayWeekStart)}</div>
          </div>
        </div>

        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white border border-border p-5">
            <div className="text-xs text-muted-foreground">Spend per cover</div>
            <div className="font-display text-2xl font-extrabold mt-1">£{stat?.spend_per_cover ? Number(stat.spend_per_cover).toFixed(2) : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Target £{target?.spend_per_cover_target ?? "—"}</div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-5">
            <div className="text-xs text-muted-foreground">Streak</div>
            <div className="font-display text-2xl font-extrabold mt-1">{streak} week{streak === 1 ? "" : "s"}</div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-5">
            <div className="text-xs text-muted-foreground">Engagement</div>
            <div className="mt-2 text-sm">Stats viewed: <span className={`font-semibold ${viewed ? "text-brand-green" : "text-muted-foreground"}`}>{viewed ? "Yes" : "Not yet"}</span></div>
            <div className="text-sm">Focus ack'd: <span className={`font-semibold ${acked ? "text-brand-green" : "text-muted-foreground"}`}>{acked ? "Yes" : "Not yet"}</span></div>
            <div className="text-sm">Total logins: <span className="font-semibold">{logins}</span></div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-6">
          <h2 className="font-display text-lg font-bold">Category breakdown</h2>
          {!stat && !hasCatStats ? (
            <p className="mt-3 text-sm text-muted-foreground">No stats this week. Upload via the manager dashboard.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {categories.map((c) => {
                const actual = Number(catStats[c.key]?.conversion ?? 0);
                const tgt = Number(catTargets[c.key] ?? 0);
                const colour = performanceColour(actual, tgt);
                const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
                return (
                  <div key={c.key} className="flex items-center gap-4">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: tone }} />
                    <div className="w-32 text-sm font-medium">{c.label}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, actual)}%`, background: tone }} />
                    </div>
                    <div className="w-24 text-right text-xs text-muted-foreground">{actual.toFixed(0)}% / {tgt.toFixed(0)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}
