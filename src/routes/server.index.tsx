import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { claimServerCsvData, recordLogin } from "@/lib/server-data";
import { Trophy, Flame, ArrowRight, TrendingDown, Sparkles } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, latestStatsWeek } from "@/lib/week";
import {
  loadServerPerformance,
  statusTone,
  eliteVisual,
  formatItems,
  type CategoryMetric,
  type ServerPerformance,
} from "@/lib/performance-engine";

export const Route = createFileRoute("/server/")({ component: ServerDashboard });

function Ring({ fillPct, color, displayValue, glow }: { fillPct: number; color: string; displayValue: string | number; glow?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, fillPct)) / 100) * c;
  return (
    <div className="relative h-28 w-28" style={{ filter: glow && glow !== "none" ? `drop-shadow(${glow})` : undefined }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={`color-mix(in oklab, ${color} 18%, white)`} strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-3xl font-bold leading-none text-foreground">{displayValue}</span>
      </div>
    </div>
  );
}

function ServerDashboard() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [hasStat, setHasStat] = useState(false);
  const [perf, setPerf] = useState<ServerPerformance | null>(null);
  const [streak, setStreak] = useState(0);
  const [coaching, setCoaching] = useState<{ category: string; tip: string }[] | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const weekStart = toISODate(getMondayOfWeek());
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);
  const [venueId, setVenueId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const fetchCoaching = useCallback(async (vId: string, uId: string, week: string) => {
    setCoachLoading(true);
    try {
      const { data: cd, error: cErr } = await supabase.functions.invoke("ai-assist", {
        body: { action: "server_coaching", venueId: vId, payload: { userId: uId, weekStart: week } },
      });
      if (cErr) throw cErr;
      setCoaching(Array.isArray(cd?.suggestions) ? cd.suggestions : []);
    } catch {
      setCoaching([]);
    } finally {
      setCoachLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      userIdRef.current = u.user.id;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      const fn = prof?.full_name || "";
      setName(fn.split(" ")[0] || "there");
      await claimServerCsvData();
      await recordLogin();
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const v = vm?.[0]?.venue_id;
      if (!v) return;
      setVenueId(v);
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("user_id", u.user.id).eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setDisplayWeekStart(visibleWeek);
      const { data: st } = await supabase.from("server_stats").select("id").eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle();
      setHasStat(!!st);
      const { data: sk } = await supabase.from("server_streaks").select("current_streak").eq("user_id", u.user.id).eq("venue_id", v).maybeSingle();
      setStreak((sk as { current_streak?: number } | null)?.current_streak ?? 0);
      const p = await loadServerPerformance({ venueId: v, userId: u.user.id, weekStart: visibleWeek });
      setPerf(p);
      await supabase.from("server_stat_views").insert({ user_id: u.user.id, venue_id: v, week_start: visibleWeek });
      if (st) await fetchCoaching(v, u.user.id, visibleWeek);
    })();
  }, [weekStart, fetchCoaching]);

  useEffect(() => {
    if (!venueId) return;
    const uId = userIdRef.current;
    if (!uId) return;
    const refresh = () => { void fetchCoaching(venueId, uId, displayWeekStart); };
    const channel = supabase
      .channel(`coaching:${venueId}:${uId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_menu", filter: `venue_id=eq.${venueId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_pairings", filter: `venue_id=eq.${venueId}` }, refresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "server_coaching", filter: `venue_id=eq.${venueId}` }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [venueId, displayWeekStart, fetchCoaching]);

  const rows: CategoryMetric[] = perf?.rows ?? [];

  // Pick the most commercially impactful winner — highest performance score
  // among rows with positive 4wk (or WoW fallback) momentum.
  const smashed = (() => {
    if (!rows.length) return null;
    const winners = rows
      .filter((r) => (r.deltaVs4wk ?? r.deltaWoW ?? 0) > 0)
      .sort((a, b) => b.score - a.score);
    if (!winners.length) return null;
    const top = winners[0];
    const delta = top.deltaVs4wk ?? top.deltaWoW ?? 0;
    return { label: top.label, delta, basis: top.deltaVs4wk !== null ? "4wk avg" : "last week" };
  })();

  // Top 3 — ranked by performance score (mix of target progress, trend,
  // commercial vs expected, and consistency). Falls back to ratio if no
  // scores available (e.g. fresh venue).
  const top3: CategoryMetric[] = rows
    .filter((r) => r.target > 0 || r.items > 0)
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Work-on: low scorers below 60 OR clearly trending down.
  const workOn = rows
    .filter((r) => r.score < 60 || (r.deltaVs4wk !== null && r.deltaVs4wk < -1))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const allGreen = top3.length >= 3 && top3.every((r) => r.statusLabel === "Strong" || r.statusLabel === "Crushing");

  const joinLabels = (xs: string[]) =>
    xs.length <= 1 ? xs.join("") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-sm flex items-center gap-2"><span className="text-xl">👋</span><span className="font-medium">Hey {name || "there"}!</span></div>
        <h1 className="mt-4 font-display text-[40px] leading-[1] font-extrabold tracking-tight">
          Stats just<br /><span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <div className="mt-3 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>
      </div>

      <div className="px-5 mt-5">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">Your Top 3</div>
          {hasStat ? (
            top3.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {top3.map((c) => {
                  const tone = statusTone(c.statusLabel);
                  const elite = eliteVisual(c.eliteTier);
                  const d4 = c.deltaVs4wk;
                  return (
                    <div key={c.key} className="flex flex-col items-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: tone }}>
                        {c.statusLabel}
                        {elite.badge && (
                          <span className="text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>{elite.badge}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                      <Ring fillPct={c.ringPct} color={tone} displayValue={c.items} glow={elite.glow} />
                      {d4 !== null ? (
                        <div className="mt-1 text-xs font-semibold" style={{ color: d4 >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}>
                          {d4 >= 0 ? "↑" : "↓"} {Math.abs(d4).toFixed(1)}pp
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted-foreground">—</div>
                      )}
                      <div className="text-[10px] text-muted-foreground">vs 4wk avg</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Not enough category data yet — once a few categories have sales and targets we'll highlight your best, average, and focus area.</p>
            )
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No stats for this week yet. Your manager will upload them after service.</p>
          )}
        </div>
      </div>

      {hasStat && smashed && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-center gap-4"
            style={{
              borderColor: `color-mix(in oklab, var(--brand-green) 40%, transparent)`,
              background: `color-mix(in oklab, var(--brand-green) 8%, white)`,
            }}>
            <Trophy className="h-12 w-12 shrink-0" style={{ color: "var(--brand-green)" }} />
            <div className="flex-1">
              <div className="font-display text-lg font-bold leading-tight">
                You smashed <span style={{ color: "var(--brand-green)" }}>{smashed.label}</span> this week!
              </div>
              <div className="mt-1 text-xs">
                <span className="font-semibold" style={{ color: "var(--brand-green)" }}>+{smashed.delta.toFixed(1)}pp</span>{" "}
                <span className="text-muted-foreground">vs {smashed.basis}</span>
              </div>
            </div>
            <div className="h-9 w-9 rounded-full text-white grid place-items-center text-sm" style={{ background: "var(--brand-green)" }}>✓</div>
          </div>
        </div>
      )}

      {hasStat && !allGreen && workOn.length > 0 && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-start gap-4"
            style={{
              borderColor: `color-mix(in oklab, var(--opportunity) 40%, transparent)`,
              background: `color-mix(in oklab, var(--opportunity) 8%, white)`,
            }}>
            <TrendingDown className="h-12 w-12 shrink-0" style={{ color: "var(--opportunity)" }} />
            <div className="flex-1">
              <div className="font-display text-lg font-bold leading-tight" style={{ color: "var(--opportunity)" }}>
                Focus on {joinLabels(workOn.map((w) => w.label))} this week
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {workOn.map((w) => {
                  const d = w.deltaVs4wk ?? w.deltaWoW;
                  return (
                    <li key={w.key}>
                      <span className="font-semibold" style={{ color: "var(--opportunity)" }}>
                        {w.label} {d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`}
                      </span>{" "}
                      <span className="text-muted-foreground">vs {w.deltaVs4wk !== null ? "4wk avg" : "last week"} · {formatItems(w)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {hasStat && (coachLoading || (coaching && coaching.length > 0)) && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl bg-white border border-border p-5">
            <div className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-orange" />
              <div className="font-semibold">Your coaching this week</div>
            </div>
            {coachLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Writing tips from your week…</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {coaching!.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-border p-3 flex gap-3">
                    <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 h-fit shrink-0" style={{ background: "color-mix(in oklab, var(--brand-green) 12%, white)", color: "var(--brand-green)" }}>{s.category}</span>
                    <span className="text-sm text-foreground/90">{s.tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="px-5 mt-4 mb-6">
        <Link to="/server/progress" className="block rounded-3xl bg-white border border-border p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-orange/15 grid place-items-center"><Flame className="h-5 w-5 text-brand-orange" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Current streak: {streak} week{streak === 1 ? "" : "s"} 🔥</div>
            <div className="text-xs text-muted-foreground">View milestones & rewards</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </ServerLayout>
  );
}
