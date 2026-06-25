import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { getActiveVenueIdForUser } from "@/lib/active-venue";
import { getMondayOfWeek, toISODate, latestStatsWeek, formatWeekRange } from "@/lib/week";
import { loadServerPerformance, type CategoryMetric, type ServerPerformance } from "@/lib/performance-engine";
import { Sparkles, Target, CheckCircle2, ChevronRight, Flame } from "lucide-react";
import { toast } from "sonner";

// Phase 10 — Server Coaching.
// Motivational, simple, server-facing coaching surface. Uses APPROVED weekly
// priorities, the server's personal focus category and AI-generated tips.
// Never exposes labour cost, LLS, opportunity factor, recoverable revenue,
// Historical Shift Match, Trading Pattern Factor or any manager-only metric.
export const Route = createFileRoute("/server/coaching")({ component: ServerCoaching });

type Priority = { id: string; item_name: string; category: string | null; priority_flag: string };
type Tip = { category: string; tip: string };

// Static fallback actions — used when AI tips are unavailable so the page is
// never empty. Tone is practical, positive, server-friendly.
const FALLBACK_ACTIONS: Record<string, string[]> = {
  wine: [
    "Lead with a by-the-glass pairing right after mains are ordered.",
    "Offer the second glass 2–3 minutes before mains land.",
    "Anchor the table on the second-from-top bottle when the list opens.",
  ],
  cocktail: [
    "Suggest a signature cocktail in the first 60 seconds of the greeting.",
    "Recommend a second round before mains arrive.",
    "Lead with the premium option — guests trade down, not up.",
  ],
  dessert: [
    "Drop the dessert menu while clearing mains, don't ask.",
    "Suggest two desserts to share — converts higher than one each.",
    "Pair the dessert with a sweet wine or digestif.",
  ],
  sides: [
    "Offer a shared side at order confirmation — guests rarely add later.",
    "Anchor with the chef's recommended side.",
  ],
  spirits: [
    "Suggest a digestif during the dessert clear.",
    "Recommend a flight when guests can't decide.",
  ],
  sparkling: [
    "Offer sparkling in the first 60 seconds — sets a celebration tone.",
    "Suggest a glass for the birthday/anniversary table.",
  ],
  default: [
    "Make one confident recommendation per table.",
    "Mention the category before the menu closes.",
    "Use guest-friendly wording: \"works beautifully with…\".",
  ],
};

function categoryKeyToBucket(key: string): keyof typeof FALLBACK_ACTIONS {
  const k = key.toLowerCase();
  if (k.includes("wine")) return "wine";
  if (k.includes("cocktail")) return "cocktail";
  if (k.includes("dessert")) return "dessert";
  if (k.includes("side")) return "sides";
  if (k.includes("spirit")) return "spirits";
  if (k.includes("sparkl")) return "sparkling";
  return "default";
}

function ServerCoaching() {
  useRoleGate("server");
  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string>(toISODate(getMondayOfWeek()));
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [perf, setPerf] = useState<ServerPerformance | null>(null);
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [acked, setAcked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      setName(((prof?.full_name as string | undefined) ?? "").split(" ")[0] || "there");
      const v = await getActiveVenueIdForUser(u.user.id);
      if (!v) { setLoading(false); return; }
      setVenueId(v);
      const ws = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at")
          .eq("user_id", u.user.id).eq("venue_id", v)
          .order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        toISODate(getMondayOfWeek()),
      );
      setWeekStart(ws);

      const [{ data: pr }, { data: ack }, p] = await Promise.all([
        supabase.from("weekly_priorities").select("id,item_name,category,priority_flag")
          .eq("venue_id", v).eq("week_start", ws),
        supabase.from("server_focus_acks").select("id")
          .eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", ws).maybeSingle(),
        loadServerPerformance({ venueId: v, userId: u.user.id, weekStart: ws }),
      ]);
      setPriorities((pr ?? []) as Priority[]);
      setAcked(!!ack);
      setPerf(p);

      // AI tips — best effort. Failure is silent; we fall back to static actions.
      try {
        const { data: cd } = await supabase.functions.invoke("ai-assist", {
          body: { action: "server_coaching", venueId: v, payload: { userId: u.user.id, weekStart: ws } },
        });
        setTips(Array.isArray(cd?.suggestions) ? cd.suggestions : []);
      } catch {
        setTips([]);
      }
      setLoading(false);
    })();
  }, []);

  // Personal focus = under-target category with the largest relative gap.
  const focus: CategoryMetric | null = (() => {
    const rows = perf?.rows ?? [];
    const under = rows.filter((r) => r.target > 0 && r.current < r.target);
    if (under.length === 0) return null;
    under.sort((a, b) => (a.current / a.target) - (b.current / b.target));
    return under[0];
  })();

  const focusActions: string[] = (() => {
    if (!focus) return FALLBACK_ACTIONS.default.slice(0, 3);
    const fromAi = (tips ?? []).filter((t) => t.tip && t.category?.toLowerCase() === focus.key.toLowerCase()).map((t) => t.tip);
    if (fromAi.length >= 2) return fromAi.slice(0, 3);
    return FALLBACK_ACTIONS[categoryKeyToBucket(focus.key)].slice(0, 3);
  })();

  const pushPriorities = priorities.filter((p) => p.priority_flag === "push");
  const standardPriorities = priorities.filter((p) => p.priority_flag !== "push");

  const acknowledge = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !venueId) return;
    const { error } = await supabase.from("server_focus_acks").insert({
      user_id: u.user.id, venue_id: venueId, week_start: weekStart,
    });
    if (error) { toast.error(error.message); return; }
    setAcked(true);
    toast.success("You've got this — go win the week 🎯");
  };

  return (
    <ServerLayout>
      <div className="px-5 pt-6 pb-10">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Coaching</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Your weekly playbook
        </h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>

        {/* Personal focus */}
        <div className="mt-5 rounded-3xl border-2 p-5"
          style={{
            borderColor: "color-mix(in oklab, var(--brand-orange) 40%, transparent)",
            background: "color-mix(in oklab, var(--brand-orange) 8%, white)",
          }}>
          <div className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider"
            style={{ color: "var(--brand-orange)" }}>
            <Target className="h-3 w-3" /> Your focus this week
          </div>
          {loading ? (
            <div className="mt-2 text-sm text-muted-foreground">Loading your coaching…</div>
          ) : focus ? (
            <>
              <div className="mt-1 font-display text-2xl font-extrabold leading-tight">
                {focus.label}
              </div>
              <div className="mt-1 text-sm text-foreground/70">
                Hey {name}, one extra {focus.label.toLowerCase()} per shift would close the gap on your usual week. You've got this.
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 font-display text-2xl font-extrabold leading-tight">Keep the rhythm</div>
              <div className="mt-1 text-sm text-foreground/70">
                You're on or above target across the board — keep doing what's working.
              </div>
            </>
          )}

          <ul className="mt-4 space-y-2.5">
            {focusActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 h-5 w-5 rounded-full grid place-items-center shrink-0"
                  style={{ background: "var(--brand-orange)", color: "white" }}>
                  <span className="text-[11px] font-bold">{i + 1}</span>
                </span>
                <span className="font-medium leading-snug">{a}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Approved priorities */}
        <div className="mt-5 rounded-3xl bg-white border border-border p-5">
          <div className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Manager-approved priorities
          </div>
          {priorities.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No priorities published for this week yet. Check back after your manager runs pre-shift.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {pushPriorities.map((p) => (
                <div key={p.id} className="rounded-2xl p-3 flex items-center gap-3 border-2"
                  style={{
                    borderColor: "color-mix(in oklab, var(--brand-green) 35%, transparent)",
                    background: "color-mix(in oklab, var(--brand-green) 8%, white)",
                  }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{p.item_name}</div>
                    {p.category && <div className="text-[11px] text-muted-foreground">{p.category}</div>}
                  </div>
                  <span className="text-[10px] font-bold rounded-md px-2 py-1"
                    style={{ background: "var(--brand-green)", color: "white" }}>PUSH</span>
                </div>
              ))}
              {standardPriorities.map((p) => (
                <div key={p.id} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{p.item_name}</div>
                    {p.category && <div className="text-[11px] text-muted-foreground">{p.category}</div>}
                  </div>
                  <span className="text-[10px] font-bold rounded-md px-2 py-1 bg-muted text-muted-foreground">Standard</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acknowledge */}
        {priorities.length > 0 && (
          <div className="mt-5">
            {acked ? (
              <div className="rounded-2xl border border-border bg-white p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5" style={{ color: "var(--brand-green)" }} />
                <div className="text-sm font-semibold">You've acknowledged this week's focus — let's go.</div>
              </div>
            ) : (
              <button onClick={acknowledge}
                className="w-full rounded-2xl px-4 py-3 font-semibold text-white"
                style={{ background: "var(--brand-green)" }}>
                Got it — I'm focused
              </button>
            )}
          </div>
        )}

        {/* Quick links */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link to="/server/menu" className="rounded-2xl border border-border bg-white p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</div>
            <div className="mt-1 font-semibold text-sm flex items-center justify-between">Pairings <ChevronRight className="h-4 w-4" /></div>
          </Link>
          <Link to="/server/rewards" className="rounded-2xl border border-border bg-white p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">See</div>
            <div className="mt-1 font-semibold text-sm flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" style={{ color: "var(--brand-orange)" }} /> Rewards</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </div>
    </ServerLayout>
  );
}
