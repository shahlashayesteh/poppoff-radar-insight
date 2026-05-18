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
  ragFromRing,
  ragColor,
  ragSoftBg,
  ragBorder,
  eliteVisual,
  humanMomentum,
  humanTargetCall,
  itemsToTarget,
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
        <span className="font-display text-3xl font-bold leading-none text-foreground">{displayValue}</span>
      </div>
    </div>
  );
}

function ragLabel(rag: Rag): string {
  if (rag === "green") return "WINNING";
  if (rag === "amber") return "CLOSE";
  return "FOCUS";
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

  const rows: CategoryMetric[] = perf?.rows ?? [];

  const smashed = (() => {
    if (!rows.length) return null;
    const winners = rows
      .filter((r) => (r.deltaVs4wk ?? r.deltaWoW ?? 0) > 0)
      .sort((a, b) => b.score - a.score);
    if (!winners.length) return null;
    const top = winners[0];
    return { row: top, momentum: humanMomentum(top), call: humanTargetCall(top) };
  })();

  const top3: CategoryMetric[] = rows
    .filter((r) => r.target > 0 || r.items > 0)
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const workOn = rows
    .filter((r) => r.score < 60 || (r.deltaVs4wk !== null && r.deltaVs4wk < -1))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const allGreen = top3.length >= 3 && top3.every((r) => ragFromRing(r.ringPct, r.target > 0) === "green");
  const focusTone: Rag = workOn.some((r) => r.target > 0 && r.ringPct < 50) ? "red" : "amber";

  const joinLabels = (xs: string[]) =>
    xs.length <= 1 ? xs.join("") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

  const totalServers = board.length;
  const myRank = myRow?.rank ?? null;
  const pct = myRank ? percentileRank(myRank, totalServers) : null;

  // ---- Tonight's Push goals ----
  type PushGoal = { id: string; rag: Rag; text: string };
  const pushGoals: PushGoal[] = (() => {
    const out: PushGoal[] = [];
    // 1) Target-proximity wins
    for (const r of rows) {
      const need = itemsToTarget(r);
      if (need !== null && need > 0 && need <= 5) {
        out.push({ id: `tgt-${r.key}`, rag: "green", text: `Sell ${need} more ${r.label.toLowerCase()} to hit target` });
      }
    }
    // 2) Go-green nudges (amber that would cross 90% with itemsToTarget worth of items)
    for (const r of rows) {
      const rag = ragFromRing(r.ringPct, r.target > 0);
      if (rag !== "amber") continue;
      const need = itemsToTarget(r);
      if (need !== null && need > 0 && need <= 6) {
        out.push({ id: `green-${r.key}`, rag: "amber", text: `Sell ${need} more ${r.label.toLowerCase()} to turn it green` });
      }
    }
    // 3) Streak protection
    if (streak > 0 && smashed?.row) {
      const need = itemsToTarget(smashed.row);
      if (need !== null && need > 0 && need <= 3) {
        out.push({ id: `streak`, rag: "green", text: `Sell 1 more ${smashed.row.label.toLowerCase()} to keep your ${streak}-week streak alive` });
      }
    }
    // 4) Rank chase
    if (myRank && myRank > 1 && Object.keys(prices).length > 0) {
      const above = board.find((r) => r.rank === myRank - 1);
      if (above && myRow) {
        const aboveItems = itemsTotalFor(above, prices);
        const myItems = itemsTotalFor(myRow, prices);
        const gap = aboveItems - myItems;
        if (gap > 0) {
          out.push({ id: `rank`, rag: "amber", text: `Move up 1 rank — ${gap} item${gap === 1 ? "" : "s"} behind ${above.full_name ?? "the server above you"}` });
        }
      }
    }
    // de-dup by id, cap 4
    const seen = new Set<string>();
    return out.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true))).slice(0, 4);
  })();

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

      {/* Top 3 circles */}
      <div className="px-5 mt-4">
        <div className="rounded-3xl bg-white border border-border p-5">
          <div className="font-semibold">Your Top 3</div>
          {hasStat ? (
            top3.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {top3.map((c) => {
                  const baseRag = ragFromRing(c.ringPct, c.target > 0);
                  const mo = humanMomentum(c);
                  // Any category trending down forces a red treatment so
                  // declining stats never appear as orange/amber.
                  const rag: Rag = mo?.rag === "red" ? "red" : baseRag;
                  const tone = ragColor(rag);
                  const elite = eliteVisual(c.eliteTier);
                  const call = humanTargetCall(c);
                  return (
                    <div key={c.key} className="flex flex-col items-center">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: tone }}>
                        {ragLabel(rag)}
                        {elite.badge && (
                          <span className="text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>{elite.badge}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{c.label}</div>
                      <Ring
                        fillPct={c.ringPct}
                        color={tone}
                        displayValue={c.items}
                        glow={elite.glow}
                        pulse={rag === "red" && c.ringPct < 50}
                      />
                      {mo ? (
                        <div className="mt-2 text-[11px] font-semibold text-center leading-tight" style={{ color: ragColor(mo.rag) }}>
                          {mo.text}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-muted-foreground">New category</div>
                      )}
                      {call && (
                        <div className="mt-1 text-[10px] text-muted-foreground text-center leading-tight">{call}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Not enough category data yet — once a few categories have sales and targets we'll highlight your best.</p>
            )
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No stats for this week yet. Your manager will upload them after service.</p>
          )}
        </div>
      </div>

      {/* Weekly Win */}
      {hasStat && smashed && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-center gap-4"
            style={{ borderColor: ragBorder("green"), background: ragSoftBg("green") }}>
            <Trophy className="h-12 w-12 shrink-0" style={{ color: "var(--brand-green)" }} />
            <div className="flex-1">
              <div className="font-display text-lg font-extrabold leading-tight">
                You're crushing <span style={{ color: "var(--brand-green)" }}>{smashed.row.label}</span>
              </div>
              {smashed.momentum && (
                <div className="mt-1 text-sm font-semibold" style={{ color: "var(--brand-green)" }}>
                  {smashed.momentum.text}
                </div>
              )}
              {smashed.call && (
                <div className="text-xs text-foreground/70 mt-0.5 font-medium">{smashed.call}</div>
              )}
            </div>
            <div className="h-9 w-9 rounded-full text-white grid place-items-center text-sm" style={{ background: "var(--brand-green)" }}>✓</div>
          </div>
        </div>
      )}

      {/* Weekly Focus */}
      {hasStat && !allGreen && workOn.length > 0 && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl border-2 p-5 flex items-start gap-4"
            style={{ borderColor: ragBorder(focusTone), background: ragSoftBg(focusTone) }}>
            <TrendingDown className="h-12 w-12 shrink-0" style={{ color: ragColor(focusTone) }} />
            <div className="flex-1">
              <div className="font-display text-lg font-extrabold leading-tight" style={{ color: ragColor(focusTone) }}>
                Push {joinLabels(workOn.map((w) => w.label))} this week
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {workOn.map((w) => {
                  const need = itemsToTarget(w);
                  const rag = ragFromRing(w.ringPct, w.target > 0);
                  let line: string;
                  if (need !== null && need > 0 && rag === "amber") {
                    line = `${need} more to go green`;
                  } else if (need !== null && need > 0) {
                    line = `${need} more to hit target`;
                  } else {
                    line = humanTargetCall(w) ?? humanMomentum(w)?.text ?? "Needs a push";
                  }
                  return (
                    <li key={w.key} className="leading-tight">
                      <span className="font-bold" style={{ color: ragColor(focusTone) }}>{w.label}:</span>{" "}
                      <span className="text-foreground/85 font-medium">{line}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tonight's Push */}
      {hasStat && pushGoals.length > 0 && (
        <div className="px-5 mt-4">
          <div className="rounded-3xl bg-white border-2 border-border p-5"
            style={{ borderColor: "color-mix(in oklab, var(--brand-orange) 35%, transparent)" }}>
            <div className="inline-flex items-center gap-2">
              <div className="h-8 w-8 rounded-full grid place-items-center" style={{ background: "var(--brand-orange)", color: "white" }}>
                <Zap className="h-4 w-4" />
              </div>
              <div className="font-display text-lg font-extrabold leading-tight">Tonight's Push</div>
            </div>
            <ul className="mt-3 space-y-2">
              {pushGoals.map((g) => (
                <li key={g.id} className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
                  style={{ background: ragSoftBg(g.rag) }}>
                  <Target className="h-4 w-4 shrink-0 mt-0.5" style={{ color: ragColor(g.rag) }} />
                  <span className="text-sm font-medium text-foreground/90 leading-snug">{g.text}</span>
                </li>
              ))}
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
                <div className="font-display text-lg font-extrabold leading-tight">Leaderboard Pulse</div>
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
                    {pulse.catch.gap === 0 ? "Tied — push past them" : `${pulse.catch.gap} item${pulse.catch.gap === 1 ? "" : "s"} ahead`}
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
          </Link>
        </div>
      )}

      {/* Coaching */}
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
