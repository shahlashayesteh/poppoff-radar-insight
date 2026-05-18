import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { claimServerCsvData, recordLogin, fetchVenueAvgPrices, estimateItemsSold, type CategoryKey } from "@/lib/server-data";
import { Trophy, Flame, ArrowRight, TrendingDown, Sparkles, Crown, Zap, Target, ChevronUp, ChevronDown } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, latestStatsWeek } from "@/lib/week";
import {
  loadServerPerformance,
  loadVenueLeaderboard,
  ragColor,
  ragSoftBg,
  ragBorder,
  eliteVisual,
  momentumPct,
  ragFromMomentum,
  magnitudeFillPct,
  topMovers,
  biggestGainer,
  biggestDecliner,
  nextWeekOpportunity,
  weeklyReflection,
  reflectionLine,
  targetItems,
  opportunityUpliftGBP,
  percentileRank,
  type CategoryMetric,
  type ServerPerformance,
  type LeaderboardRow,
  type Rag,
} from "@/lib/performance-engine";


export const Route = createFileRoute("/server/")({ component: ServerDashboard });

function Ring({ fillPct, color, displayValue, glow, pulse }: { fillPct: number; color: string; displayValue: string | number; glow?: string; pulse?: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, fillPct)) / 100) * c;
  return (
    <div
      className={`relative h-28 w-28 ${pulse ? "animate-pulse" : ""}`}
      style={{ filter: glow && glow !== "none" ? `drop-shadow(${glow})` : undefined }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={`color-mix(in oklab, ${color} 8%, white)`} strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="11" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-2xl font-bold leading-none text-foreground">{displayValue}</span>
      </div>
    </div>
  );
}

function ragLabel(rag: Rag): string {
  if (rag === "green") return "WINNING";
  if (rag === "amber") return "CLOSE";
  return "FOCUS";
}

function signedPctLabel(pct: number | null): string {
  if (pct === null) return "—";
  const r = Math.round(pct);
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : ""}${r}%`;
}

function itemsTotalFor(row: LeaderboardRow, prices: Record<string, number>): number {
  const byCat = row.current_by_category;
  if (!byCat) return 0;
  let total = 0;
  for (const [key, c] of Object.entries(byCat)) {
    if (c?.quantity != null && c.quantity > 0) {
      total += Math.round(Number(c.quantity));
    } else if (c?.sales) {
      total += estimateItemsSold(Number(c.sales), key as CategoryKey, prices);
    }
  }
  return total;
}

function ServerDashboard() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [hasStat, setHasStat] = useState(false);
  const [perf, setPerf] = useState<ServerPerformance | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [myRow, setMyRow] = useState<LeaderboardRow | null>(null);
  const [streak, setStreak] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
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
      const [p, lb, pr] = await Promise.all([
        loadServerPerformance({ venueId: v, userId: u.user.id, weekStart: visibleWeek }),
        loadVenueLeaderboard({ venueId: v, weekStart: visibleWeek }),
        fetchVenueAvgPrices(v),
      ]);
      setPerf(p);
      setBoard(lb);
      setMyRow(lb.find((r) => r.user_id === u.user.id) ?? null);
      setPrices(pr);
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

  // -------------------------------------------------------------------------
  // Curated insights — Home is "what mattered most + what to push next".
  // All numbers come from the engine; no math here.
  // -------------------------------------------------------------------------
  const movers: CategoryMetric[] = topMovers(perf, 3);
  const reflection = weeklyReflection(perf);
  const gainer = biggestGainer(perf);
  const decliner = biggestDecliner(perf);
  const opportunity = nextWeekOpportunity(perf);

  // Next-week opportunity list (up to 3 picks): the primary opportunity
  // plus other under-target categories with meaningful lift, de-duped.
  const opportunityList: CategoryMetric[] = (() => {
    const rows = perf?.rows ?? [];
    const candidates = rows
      .filter((r) => r.target > 0 && r.current < r.target)
      .sort((a, b) => {
        const av = (((a.target - a.current) / 100)) * (a.avgUnitPrice ?? 0);
        const bv = (((b.target - b.current) / 100)) * (b.avgUnitPrice ?? 0);
        return bv - av;
      });
    const seen = new Set<string>();
    const picked: CategoryMetric[] = [];
    if (opportunity) { picked.push(opportunity); seen.add(opportunity.key); }
    for (const c of candidates) {
      if (seen.has(c.key)) continue;
      picked.push(c);
      seen.add(c.key);
      if (picked.length >= 3) break;
    }
    return picked;
  })();

  const totalServers = board.length;
  const myRank = myRow?.rank ?? null;
  const pct = myRank ? percentileRank(myRank, totalServers) : null;

  // ---- Leaderboard Pulse ----
  const pulse = (() => {
    if (!myRank || totalServers <= 1 || !myRow || Object.keys(prices).length === 0) return null;
    const myItems = itemsTotalFor(myRow, prices);
    const above = board.find((r) => r.rank === myRank - 1);
    const below = board.find((r) => r.rank === myRank + 1);
    return {
      catch: above ? { name: above.full_name ?? "Next server", gap: Math.max(0, itemsTotalFor(above, prices) - myItems) } : null,
      watch: below ? { name: below.full_name ?? "Server below", gap: Math.max(0, myItems - itemsTotalFor(below, prices)) } : null,
    };
  })();

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-sm flex items-center gap-2"><span className="text-xl">👋</span><span className="font-medium">Hey {name || "there"}!</span></div>
        <h1 className="mt-4 font-display text-[40px] leading-[1] font-extrabold tracking-tight">
          Stats just<br /><span style={{ color: "var(--brand-green)" }}>dropped</span> 🎉
        </h1>
        <div className="mt-3 text-xs text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>
      </div>

      {hasStat && myRank && totalServers > 1 && (
        <div className="px-5 mt-5">
          <Link
            to="/server/leaderboard"
            className="block rounded-3xl p-5 border-2 flex items-center gap-4"
            style={{
              borderColor: myRank === 1 ? "var(--brand-green)" : "color-mix(in oklab, var(--brand-orange) 50%, transparent)",
              background: myRank === 1
                ? "color-mix(in oklab, var(--brand-green) 14%, white)"
                : "color-mix(in oklab, var(--brand-orange) 10%, white)",
            }}
          >
            <div className="h-14 w-14 rounded-full grid place-items-center shrink-0"
              style={{ background: myRank === 1 ? "var(--brand-green)" : "var(--brand-orange)", color: "white" }}>
              {myRank === 1 ? <Crown className="h-7 w-7" /> : <span className="font-display text-2xl font-extrabold">#{myRank}</span>}
            </div>
            <div className="flex-1">
              <div className="font-display text-xl font-extrabold leading-tight">
                {myRank === 1 ? "You're #1 this week!" : `You're #${myRank} of ${totalServers}`}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {pct !== null && pct >= 50 && myRank !== 1
                  ? `Outperforming ${pct}% of the team`
                  : myRank === 1
                    ? "Hold the top spot"
                    : `${myRank - 1} ${myRank - 1 === 1 ? "place" : "places"} from the top`}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      )}

      {/* Top 3 — biggest movers (magnitude-driven barometers) */}
      <div className="px-5 mt-4">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">What mattered most this week</div>
          {hasStat ? (
            movers.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {movers.map((c) => {
                  const m = momentumPct(c);
                  const rag = ragFromMomentum(m);
                  const tone = ragColor(rag);
                  const elite = eliteVisual(c.eliteTier);
                  return (
                    <div key={c.key} className="flex flex-col items-center">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: tone }}>
                        {ragLabel(rag)}
                        {elite.badge && rag === "green" && (
                          <span className="text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>{elite.badge}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                      <Ring
                        fillPct={magnitudeFillPct(m)}
                        color={tone}
                        displayValue={signedPctLabel(m)}
                        glow={rag === "green" ? elite.glow : "none"}
                        pulse={rag === "red" && m !== null && m <= -15}
                      />
                      <div className="mt-2 text-[11px] font-semibold text-center leading-tight" style={{ color: tone }}>
                        {m === null ? "New category" : "vs your usual"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Not enough category data yet to highlight movement.</p>
            )
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No stats for this week yet. Your manager will upload them after service.</p>
          )}
        </div>
      </div>

      {/* Weekly performance summary — one-line emotional headline */}
      {hasStat && reflection && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5"
            style={{ borderColor: ragBorder(reflection.rag), background: ragSoftBg(reflection.rag) }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: ragColor(reflection.rag) }}>
              Weekly summary
            </div>
            <div className="mt-1 font-display text-xl font-extrabold leading-tight">
              {reflection.text}
            </div>
            {gainer && decliner && (
              <div className="mt-2 text-xs text-foreground/70 font-medium leading-snug">
                {gainer.label} helped offset weaker {decliner.label.toLowerCase()} performance.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Biggest win this week */}
      {hasStat && gainer && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-center gap-4"
            style={{ borderColor: ragBorder("green"), background: ragSoftBg("green") }}>
            <Trophy className="h-12 w-12 shrink-0" style={{ color: "var(--brand-green)" }} />
            <div className="flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--brand-green)" }}>
                Biggest win this week
              </div>
              <div className="font-display text-lg font-extrabold leading-tight mt-0.5">
                {reflectionLine(gainer)}
              </div>
              <div className="text-xs text-foreground/70 mt-1 font-medium">
                {gainer.label} became one of your strongest categories.
              </div>
            </div>
            <div className="h-9 w-9 rounded-full text-white grid place-items-center text-sm" style={{ background: "var(--brand-green)" }}>✓</div>
          </div>
        </div>
      )}

      {/* Biggest miss this week */}
      {hasStat && decliner && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-start gap-4"
            style={{ borderColor: ragBorder("red"), background: ragSoftBg("red") }}>
            <TrendingDown className="h-12 w-12 shrink-0" style={{ color: ragColor("red") }} />
            <div className="flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: ragColor("red") }}>
                Biggest miss this week
              </div>
              <div className="font-display text-lg font-extrabold leading-tight mt-0.5" style={{ color: ragColor("red") }}>
                {reflectionLine(decliner)}
              </div>
              <div className="text-xs text-foreground/80 mt-1 font-medium">
                {decliner.label} created the biggest drag on your ranking this week.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Next week opportunities — concrete Target / Actual / Gap + reward */}
      {hasStat && opportunityList.length > 0 && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl bg-white border-2 p-5"
            style={{ borderColor: "color-mix(in oklab, var(--brand-orange) 35%, transparent)" }}>
            <div className="inline-flex items-center gap-2">
              <div className="h-8 w-8 rounded-full grid place-items-center" style={{ background: "var(--brand-orange)", color: "white" }}>
                <Zap className="h-4 w-4" />
              </div>
              <div className="font-display text-lg font-extrabold leading-tight">Next week opportunities</div>
            </div>
            <ul className="mt-3 space-y-2.5">
              {opportunityList.map((o, idx) => {
                const isPrimary = idx === 0;
                const rag: Rag = isPrimary ? "red" : "amber";
                const tone = ragColor(rag);
                const word = o.label.toLowerCase();
                const tgtN = targetItems(o);
                const actualN = o.items > 0 ? o.items : null;
                const gapN = tgtN !== null && actualN !== null ? Math.max(0, tgtN - actualN) : null;
                const uplift = opportunityUpliftGBP(o);
                // Future reward — connects action to outcome
                let reward: string | null = null;
                if (pulse?.catch && uplift !== null) {
                  reward = `Could move you above ${pulse.catch.name}`;
                } else if (uplift !== null && uplift >= 30) {
                  reward = `Roughly £${uplift} in uplift`;
                } else if (pulse?.watch) {
                  reward = `Protects your rank from ${pulse.watch.name}`;
                } else if (myRank && myRank > 1) {
                  reward = `Strong week could lift your rank`;
                }
                return (
                  <li key={o.key} className="rounded-2xl px-3.5 py-3"
                    style={{ background: ragSoftBg(rag) }}>
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 shrink-0" style={{ color: tone }} />
                      <span className="font-display text-sm font-extrabold" style={{ color: tone }}>{o.label}</span>
                    </div>
                    {tgtN !== null && actualN !== null ? (
                      <div className="mt-1.5 text-[13px] leading-snug text-foreground/90 font-medium">
                        <div>Target: <span className="font-bold">{tgtN} {word}</span> a week</div>
                        <div>You finished on <span className="font-bold">{actualN}</span></div>
                        {gapN !== null && gapN > 0 && (
                          <div className="mt-0.5" style={{ color: tone }}>
                            <span className="font-bold">{gapN} more {word}</span> next week → back above target
                          </div>
                        )}
                        {gapN === 0 && (
                          <div className="mt-0.5" style={{ color: "var(--brand-green)" }}>
                            Hold this pace to stay green
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[13px] leading-snug text-foreground/90 font-medium">
                        {o.label} is your easiest win to chase next week
                      </div>
                    )}
                    {reward && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--brand-green)" }}>
                        <Sparkles className="h-3 w-3" /> {reward}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}


      {/* Leaderboard Pulse */}
      {hasStat && pulse && (pulse.catch || pulse.watch) && (
        <div className="px-5 mt-4">
          <Link to="/server/leaderboard" className="block rounded-3xl bg-white border-2 p-5"
            style={{ borderColor: "color-mix(in oklab, var(--brand-green) 35%, transparent)" }}>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <Trophy className="h-5 w-5" style={{ color: "var(--brand-green)" }} />
                <div className="font-display text-lg font-extrabold leading-tight">Ranking movement</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {pulse.catch ? (
                <div className="rounded-2xl p-3" style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1" style={{ color: "var(--brand-green)" }}>
                    <ChevronUp className="h-3 w-3" /> Next to catch
                  </div>
                  <div className="mt-1 font-display text-sm font-extrabold leading-tight truncate">{pulse.catch.name}</div>
                  <div className="text-[11px] text-foreground/70 mt-0.5">
                    {pulse.catch.gap === 0 ? "Tied — overtake next week" : `${pulse.catch.gap} item${pulse.catch.gap === 1 ? "" : "s"} ahead`}
                  </div>
                </div>
              ) : <div />}
              {pulse.watch ? (
                <div className="rounded-2xl p-3" style={{ background: "color-mix(in oklab, var(--brand-orange) 10%, white)" }}>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1" style={{ color: "var(--brand-orange)" }}>
                    <ChevronDown className="h-3 w-3" /> Watch out
                  </div>
                  <div className="mt-1 font-display text-sm font-extrabold leading-tight truncate">{pulse.watch.name}</div>
                  <div className="text-[11px] text-foreground/70 mt-0.5">
                    {pulse.watch.gap === 0 ? "Breathing down your neck" : `${pulse.watch.gap} item${pulse.watch.gap === 1 ? "" : "s"} behind`}
                  </div>
                </div>
              ) : <div />}
            </div>
            {(() => {
              // Future-reward hook — what a strong next week unlocks.
              if (myRank && myRank <= 2 && pulse.watch) {
                return (
                  <div className="mt-3 text-[12px] font-bold" style={{ color: "var(--brand-green)" }}>
                    A strong week protects your top spot
                  </div>
                );
              }
              if (pulse.catch && pulse.catch.gap > 0 && pulse.catch.gap <= 10) {
                return (
                  <div className="mt-3 text-[12px] font-bold" style={{ color: "var(--brand-green)" }}>
                    You're 1 strong week away from #{(myRank ?? 0) - 1}
                  </div>
                );
              }
              if (pulse.catch) {
                return (
                  <div className="mt-3 text-[12px] font-bold" style={{ color: "var(--brand-green)" }}>
                    A stronger week could move you up the board
                  </div>
                );
              }
              return null;
            })()}
          </Link>
        </div>
      )}

      {/* Coaching — short, punchy, immediately actionable. */}
      {hasStat && (coachLoading || (coaching && coaching.length > 0)) && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl bg-white border border-border p-5">
            <div className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-orange" />
              <div className="font-semibold">Quick coaching for next week</div>
            </div>
            {coachLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Writing tips from your week…</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {coaching!.slice(0, 3).map((s, i) => {
                  // Strip any verbose appended stats parenthetical so cached
                  // tips also feel punchy. Keep first sentence, cap at 20 words.
                  const cleaned = String(s.tip || "")
                    .replace(/\s*\([^)]*\)\s*$/g, "")
                    .replace(/\s+/g, " ")
                    .trim();
                  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
                  const stripped = firstSentence.replace(/\.$/, "");
                  const words = stripped.split(/\s+/).filter(Boolean);
                  const short = words.length > 20 ? words.slice(0, 20).join(" ") : stripped;
                  return (
                    <li key={i} className="rounded-xl px-3 py-2 flex items-start gap-2.5"
                      style={{ background: "color-mix(in oklab, var(--brand-green) 6%, white)" }}>
                      <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--brand-green)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.category}</div>
                        <div className="text-[13px] font-semibold text-foreground leading-snug">{short}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}


      <div className="px-5 mt-4 mb-6 grid grid-cols-2 gap-3">
        <Link to="/server/leaderboard" className="rounded-3xl bg-white border border-border p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-green/15 grid place-items-center"><Trophy className="h-5 w-5 text-brand-green" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Leaderboard</div>
            <div className="text-xs text-muted-foreground">See the rankings</div>
          </div>
        </Link>
        <Link to="/server/progress" className="rounded-3xl bg-white border border-border p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-orange/15 grid place-items-center"><Flame className="h-5 w-5 text-brand-orange" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">{streak} week{streak === 1 ? "" : "s"} 🔥</div>
            <div className="text-xs text-muted-foreground">Streak & rewards</div>
          </div>
        </Link>
      </div>
    </ServerLayout>
  );
}
