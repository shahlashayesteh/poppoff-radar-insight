import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour, latestStatsWeek } from "@/lib/week";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/server/$id")({ component: ServerView });

const cats = [
  { key: "wine_conversion", t: "wine_target", label: "Wine" },
  { key: "cocktail_conversion", t: "cocktail_target", label: "Cocktails" },
  { key: "dessert_conversion", t: "dessert_target", label: "Desserts" },
  { key: "sides_conversion", t: "sides_target", label: "Sides" },
  { key: "spirits_conversion", t: "spirits_target", label: "Spirits" },
  { key: "sparkling_conversion", t: "sparkling_target", label: "Sparkling" },
];

function ServerView() {
  const { id } = Route.useParams();
  const [name, setName] = useState("");
  const [stat, setStat] = useState<any>(null);
  const [target, setTarget] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [viewed, setViewed] = useState(false);
  const [acked, setAcked] = useState(false);
  const [logins, setLogins] = useState(0);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [coaching, setCoaching] = useState<{ category: string; tip: string }[] | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);

  const loadCoaching = async (vId: string, weekISO: string, force = false) => {
    setCoachLoading(true);
    setCoaching(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: { action: "server_coaching", venueId: vId, payload: { userId: id, weekStart: weekISO, force } },
      });
      if (error) throw error;
      setCoaching(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (e: any) {
      toast.error(e.message || "Could not generate coaching");
      setCoaching([]);
    } finally {
      setCoachLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      setVenueId(v);
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
      if (st) loadCoaching(v, visibleWeek, false);
    })();
  }, [id, weekStart]);

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
          {!stat ? (
            <p className="mt-3 text-sm text-muted-foreground">No stats this week. Upload via the manager dashboard.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {cats.map((c) => {
                const actual = Number(stat[c.key] ?? 0);
                const tgt = Number(target?.[c.t] ?? 0);
                const colour = performanceColour(actual, tgt);
                const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
                return (
                  <div key={c.label} className="flex items-center gap-4">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: tone }} />
                    <div className="w-32 text-sm font-medium">{c.label}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, actual)}%`, background: tone }} />
                    </div>
                    <div className="w-24 text-right text-xs text-muted-foreground">{actual.toFixed(0)}% / {tgt}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {stat && (
          <div className="mt-6 rounded-2xl bg-white border border-border p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display text-lg font-bold inline-flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-orange" /> AI coaching for {name}
              </h2>
              <button
                onClick={() => venueId && loadCoaching(venueId, displayWeekStart, true)}
                disabled={coachLoading || !venueId}
                className="rounded-xl px-3 py-1.5 text-xs font-bold text-white inline-flex items-center gap-2 disabled:opacity-50"
                style={{ background: "var(--brand-green)" }}
              >
                <Wand2 className="h-3.5 w-3.5" /> {coachLoading ? "Generating…" : "Regenerate"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Based on this server's stats for {formatWeekRange(displayWeekStart)}.</p>
            {coachLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Reading their week and writing personal tips…</p>
            ) : !coaching || coaching.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No tips yet — click Regenerate.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {coaching.map((s, i) => (
                  <li key={i} className="rounded-xl border border-border p-3 flex gap-3">
                    <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 h-fit shrink-0" style={{ background: "color-mix(in oklab, var(--brand-green) 12%, white)", color: "var(--brand-green)" }}>{s.category}</span>
                    <span className="text-sm text-foreground/90">{s.tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
