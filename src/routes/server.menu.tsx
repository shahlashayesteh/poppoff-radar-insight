import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData } from "@/lib/server-data";
import { useRoleGate } from "@/lib/auth-gate";
import { getActiveVenueIdForUser } from "@/lib/active-venue";
import { Sparkles, CheckCircle2, Search, Target, Zap, MessageSquareQuote, Clock } from "lucide-react";
import { getMondayOfWeek, toISODate, latestStatsWeek } from "@/lib/week";
import { toast } from "sonner";

export const Route = createFileRoute("/server/menu")({ component: ServerMenu });

type Priority = { id: string; item_name: string; category: string | null; priority_flag: string };
type Pairing = {
  id: string;
  item: string;
  pair_with: string;
  why: string | null;
  priority: string | null;
  category: string | null;
  position: number;
};

const CAT_LABEL: Record<string, string> = {
  wine_bottle: "Wine (Bottle)",
  wine_glass: "Wine (Glass)",
  cocktail: "Cocktail",
  sake: "Sake",
  beer: "Beer",
  spirit: "Spirit",
  dessert: "Dessert",
  other: "Other",
};

const CAT_EMOJI: Record<string, string> = {
  wine_bottle: "🍾",
  wine_glass: "🍷",
  cocktail: "🍸",
  sake: "🍶",
  beer: "🍺",
  spirit: "🥃",
  dessert: "🍰",
  other: "✨",
};

// Map pairing category → server stat category key (for personalization)
function pairingToStatKey(cat: string | null): string | null {
  if (!cat) return null;
  if (cat.startsWith("wine")) return "wine";
  if (cat === "cocktail") return "cocktail";
  if (cat === "dessert") return "dessert";
  if (cat === "spirit") return "spirits";
  if (cat === "sake" || cat === "beer") return null;
  return null;
}

// ───────── Tactical playbook (senior F&B coaching) ─────────
type StatKey = "wine" | "cocktail" | "dessert" | "sides" | "spirits" | "sparkling";

const STAT_DISPLAY: Record<StatKey, { label: string; emoji: string }> = {
  wine: { label: "Wine", emoji: "🍷" },
  cocktail: { label: "Cocktails", emoji: "🍸" },
  dessert: { label: "Desserts", emoji: "🍰" },
  sides: { label: "Sides", emoji: "🥗" },
  spirits: { label: "Spirits", emoji: "🥃" },
  sparkling: { label: "Sparkling", emoji: "🍾" },
};

const TACTICS: Record<StatKey, { tactic: string; detail: string; timing: string }[]> = {
  wine: [
    { tactic: "Lead with a by-the-glass pairing, not the list", detail: "A confident suggestion converts faster than a 40-page list.", timing: "Best right after mains are ordered" },
    { tactic: "Anchor with the second-from-top bottle", detail: "Most tables trade down one step — you set the ceiling.", timing: "Strongest when the wine list first opens" },
    { tactic: "Offer the second glass before mains land", detail: "Refills almost never happen once food arrives.", timing: "Best 2–3 minutes before mains" },
  ],
  cocktail: [
    { tactic: "Lead with the premium cocktail first", detail: "Guests trade down naturally, not up.", timing: "Best during the greeting" },
    { tactic: "Suggest cocktails while menus are still open", detail: "Conversion drops the second menus close.", timing: "Strongest in the first 5 minutes" },
    { tactic: "Recommend before mains arrive", detail: "Once food lands, the table switches to water mode.", timing: "Best before main course pickup" },
  ],
  dessert: [
    { tactic: "Open the menu directly at the hero dessert", detail: "Don't ask IF — show. Visual commitment doubles conversion.", timing: "Best while clearing mains" },
    { tactic: "Use 'everyone's been loving…' language", detail: "Social proof is the single biggest dessert lever.", timing: "Strongest during the clear, not after the bill" },
    { tactic: "Pair dessert with a digestif or espresso martini", detail: "Bundling lifts both ticket size and dessert take-rate.", timing: "Best in the same breath as the dessert pitch" },
  ],
  sides: [
    { tactic: "Suggest one shareable side per two guests", detail: "Framing it 'for the table' removes personal commitment.", timing: "Best as mains are ordered" },
    { tactic: "Name the side, don't ask 'any sides?'", detail: "'The truffle fries are made for the ribeye' converts 3× better.", timing: "Strongest in the same sentence as the main" },
    { tactic: "Default to two sides on steak / sharing mains", detail: "Confident defaults beat open-ended questions.", timing: "Best at order confirmation" },
  ],
  spirits: [
    { tactic: "Offer a digestif while clearing dessert", detail: "Best window of the night — guests are relaxed and lingering.", timing: "Best during the dessert clear" },
    { tactic: "Name two options, not a category", detail: "'An Amaro or an aged rum?' beats 'a digestif?'", timing: "Strongest right after dessert" },
    { tactic: "Suggest a flight for curious tables", detail: "Flights turn one drink into three.", timing: "Best when a table is in exploring mode" },
  ],
  sparkling: [
    { tactic: "Offer sparkling as the welcome pour", detail: "Set the tone for the table before menus open.", timing: "Best in the first 60 seconds" },
    { tactic: "Read the occasion — birthdays, anniversaries", detail: "Celebration cues are the easiest sparkling conversion.", timing: "Strongest during the greeting" },
    { tactic: "Pour by the glass, then upgrade to a bottle", detail: "Lower friction first, then trade up once the table is in.", timing: "Best when the table hesitates on a bottle" },
  ],
};

const SCRIPTS: Record<StatKey, { weak: string; strong: string }[]> = {
  wine: [
    { weak: "Would you like wine?", strong: "A Sauvignon Blanc works beautifully with what you've ordered." },
    { weak: "Still or sparkling water?", strong: "Shall I bring a glass of the house white while you decide?" },
  ],
  cocktail: [
    { weak: "Would you like a drink?", strong: "The Espresso Martini has been the favourite tonight." },
    { weak: "Anything from the bar?", strong: "Our Negroni is the one regulars come back for." },
  ],
  dessert: [
    { weak: "Do you want dessert?", strong: "The Hot Fudge Sundae has been the favourite tonight." },
    { weak: "Any dessert for you?", strong: "Everyone's been loving the sticky toffee — shall I bring one for the table?" },
  ],
  sides: [
    { weak: "Any sides?", strong: "The truffle fries are made for the ribeye — shall I add one for the table?" },
  ],
  spirits: [
    { weak: "Anything else?", strong: "An aged rum or an Amaro to finish?" },
  ],
  sparkling: [
    { weak: "Still or sparkling water?", strong: "Shall I start you with a glass of Prosecco while you settle in?" },
  ],
};

const PAIRING_TIMING: Record<StatKey, string> = {
  wine: "Best as mains are ordered",
  cocktail: "Best during the greeting",
  dessert: "Best while clearing mains",
  sides: "Best at order confirmation",
  spirits: "Best during the dessert clear",
  sparkling: "Best in the first 60 seconds",
};

function ServerMenu() {
  const [items, setItems] = useState<Priority[]>([]);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [weakCats, setWeakCats] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [acked, setAcked] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(toISODate(getMondayOfWeek()));

  const loadPairings = useCallback(async (v: string) => {
    const { data } = await supabase
      .from("venue_pairings")
      .select("id, item, pair_with, why, priority, category, position")
      .eq("venue_id", v)
      .order("position", { ascending: true });
    setPairings(((data ?? []) as unknown) as Pairing[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await claimServerCsvData();
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const v = vm?.[0]?.venue_id;
      if (!v) return;
      setVenueId(v);
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("user_id", u.user.id).eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setWeekStart(visibleWeek);
      const { data: pr } = await supabase.from("weekly_priorities").select("*").eq("venue_id", v).eq("week_start", visibleWeek);
      setItems((pr ?? []) as Priority[]);
      const { data: ack } = await supabase.from("server_focus_acks").select("id").eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle();
      setAcked(!!ack);

      // Pairings + personalization
      await loadPairings(v);

      // Compute weakest categories from server's own stats vs targets (latest week)
      const [{ data: catStats }, { data: catTargets }, { data: legacyStat }, { data: legacyTgt }] = await Promise.all([
        supabase.from("server_category_stats").select("category_key, conversion, quantity, metric_type")
          .eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", visibleWeek),
        supabase.from("server_category_targets").select("category_key, target")
          .eq("user_id", u.user.id).eq("venue_id", v),
        supabase.from("server_stats").select("wine_conversion,dessert_conversion,cocktail_conversion,sides_conversion,spirits_conversion,sparkling_conversion")
          .eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", visibleWeek).maybeSingle(),
        supabase.from("server_targets").select("wine_target,dessert_target,cocktail_target,sides_target,spirits_target,sparkling_target")
          .eq("user_id", u.user.id).eq("venue_id", v).maybeSingle(),
      ]);
      const tMap = new Map<string, number>();
      (catTargets ?? []).forEach((t: any) => tMap.set(t.category_key, Number(t.target) || 0));
      let ranked = (catStats ?? [])
        .map((s: any) => {
          const target = tMap.get(s.category_key) || 0;
          const actual = s.metric_type === "quantity" ? Number(s.quantity || 0) : Number(s.conversion || 0);
          const gap = target > 0 ? actual / target : 1;
          return { key: s.category_key, gap };
        })
        .filter((r) => r.gap < 1)
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 2)
        .map((r) => r.key);
      // Fallback to legacy six-column stats when no dynamic category rows exist
      if (ranked.length === 0 && legacyStat) {
        const legacyKeys = ["wine", "dessert", "cocktail", "sides", "spirits", "sparkling"] as const;
        ranked = legacyKeys
          .map((k) => {
            const actual = Number((legacyStat as any)[`${k}_conversion`] ?? 0);
            const target = Number((legacyTgt as any)?.[`${k}_target`] ?? 0);
            const gap = target > 0 ? actual / target : 1;
            return { key: k, gap };
          })
          .filter((r) => r.gap < 1)
          .sort((a, b) => a.gap - b.gap)
          .slice(0, 2)
          .map((r) => r.key);
      }
      setWeakCats(ranked);
    })();
  }, [weekStart, loadPairings]);

  // Realtime: refresh pairings when manager regenerates
  useEffect(() => {
    if (!venueId) return;
    const channel = supabase
      .channel(`pairings:${venueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_pairings", filter: `venue_id=eq.${venueId}` }, () => {
        void loadPairings(venueId);
      })
      .subscribe();
    const onFocus = () => { void loadPairings(venueId); };
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [venueId, loadPairings]);

  const acknowledge = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !venueId) return;
    const { error } = await supabase.from("server_focus_acks").insert({ user_id: u.user.id, venue_id: venueId, week_start: weekStart });
    if (error) { toast.error(error.message); return; }
    setAcked(true);
    toast.success("Got it — let's go!");
  };

  const { focusPairings, otherPairings } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? pairings.filter((p) => [p.item, p.pair_with, p.why, p.category].some((f) => (f || "").toLowerCase().includes(q)))
      : pairings;
    const weak = new Set(weakCats);
    const focus: Pairing[] = [];
    const other: Pairing[] = [];
    for (const p of filtered) {
      const k = pairingToStatKey(p.category);
      if (k && weak.has(k)) focus.push(p);
      else other.push(p);
    }
    return { focusPairings: focus, otherPairings: other };
  }, [pairings, search, weakCats]);

  const renderPairing = (p: Pairing, focus = false) => {
    const cat = p.category || "other";
    const emoji = CAT_EMOJI[cat] || "✨";
    const label = CAT_LABEL[cat] || "Pairing";
    const statKey = pairingToStatKey(p.category) as StatKey | null;
    const timing = focus && statKey ? PAIRING_TIMING[statKey] : null;
    const wording = focus ? `"Our ${p.pair_with} works beautifully with the ${p.item}."` : null;
    return (
      <div key={p.id} className="rounded-2xl bg-white border border-border p-3 flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl grid place-items-center text-2xl shrink-0"
          style={{ background: focus ? "color-mix(in oklab, var(--brand-orange) 14%, white)" : "color-mix(in oklab, var(--brand-green) 8%, white)" }}>{emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Pair</div>
          <div className="font-semibold text-sm truncate">{p.item}</div>
          <div className="text-xs text-muted-foreground mt-1">with</div>
          <div className="font-semibold text-sm truncate">{p.pair_with}</div>
          {p.why && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.why}</div>}
          {timing && (
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-orange">
              <Clock className="h-3 w-3" /> {timing}
            </div>
          )}
          {wording && (
            <div className="mt-1.5 text-[11px] italic text-foreground/80 leading-snug">
              💬 {wording}
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold rounded-md px-2 py-1 whitespace-nowrap"
          style={{
            background: focus ? "color-mix(in oklab, var(--brand-orange) 18%, white)" : "var(--muted)",
            color: focus ? "var(--brand-orange)" : "var(--muted-foreground)",
          }}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Coaching</h1>
        <p className="text-sm text-muted-foreground mt-1">Tactics, scripts and pairings to win the floor this week.</p>

        {/* This week's focus — driven by weakest categories */}
        {weakCats.length > 0 && (
          <div className="mt-5 rounded-2xl p-4"
            style={{ background: "color-mix(in oklab, var(--brand-orange) 10%, white)", border: "1px solid color-mix(in oklab, var(--brand-orange) 30%, transparent)" }}>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-orange">
              <Target className="h-4 w-4" /> This week's focus
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {weakCats.slice(0, 2).map((k) => {
                const d = STAT_DISPLAY[k as StatKey];
                if (!d) return null;
                return (
                  <span key={k} className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-border px-3 py-1.5 text-sm font-semibold">
                    <span>{d.emoji}</span> {d.label}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-foreground/70 leading-snug">
              These categories created the biggest opportunity this week. Push them during service and your ranking moves fastest.
            </p>
          </div>
        )}

        {/* Quick win tactics per focus category */}
        {weakCats.slice(0, 2).map((k) => {
          const tips = TACTICS[k as StatKey];
          const d = STAT_DISPLAY[k as StatKey];
          if (!tips || !d) return null;
          return (
            <div key={`tac-${k}`} className="mt-6">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-green mb-2">
                <Zap className="h-4 w-4" /> 3 easy {d.label.toLowerCase()} wins this week
              </div>
              <div className="space-y-2">
                {tips.map((t, i) => (
                  <div key={i} className="rounded-2xl bg-white border border-border p-3 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg grid place-items-center text-sm font-bold shrink-0"
                      style={{ background: "color-mix(in oklab, var(--brand-green) 12%, white)", color: "var(--brand-green)" }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm leading-snug">{t.tactic}</div>
                      <div className="text-xs text-muted-foreground mt-1 leading-snug">{t.detail}</div>
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-orange">
                        <Clock className="h-3 w-3" /> {t.timing}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Micro-scripts — exact wording */}
        {weakCats.length > 0 && (
          <div className="mt-6">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-green mb-2">
              <MessageSquareQuote className="h-4 w-4" /> Say this, not that
            </div>
            <div className="space-y-2">
              {weakCats.slice(0, 2).flatMap((k) =>
                (SCRIPTS[k as StatKey] || []).map((s, i) => (
                  <div key={`${k}-${i}`} className="rounded-2xl bg-white border border-border p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-bold">
                      {STAT_DISPLAY[k as StatKey]?.emoji} {STAT_DISPLAY[k as StatKey]?.label}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground line-through">
                      {s.weak}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-brand-green leading-snug">
                      💬 {s.strong}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


        {items.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-white border border-border p-5 text-sm text-muted-foreground">
            Your manager hasn't set this week's priorities yet.
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl p-4"
              style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", border: "1px solid color-mix(in oklab, var(--brand-green) 30%, transparent)" }}>
              <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-green">
                <Sparkles className="h-4 w-4" /> Push these this week
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {items.map((m) => (
                <div key={m.id} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl grid place-items-center text-2xl"
                    style={{ background: "color-mix(in oklab, var(--brand-orange) 8%, white)" }}>🍽️</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{m.item_name}</div>
                    <div className="text-xs text-muted-foreground">{m.category || "Menu item"}</div>
                  </div>
                  <span className="text-xs font-bold rounded-md px-2 py-1"
                    style={{
                      background: m.priority_flag === "push" ? "color-mix(in oklab, var(--brand-orange) 18%, white)" : "var(--muted)",
                      color: m.priority_flag === "push" ? "var(--brand-orange)" : "var(--muted-foreground)",
                    }}>
                    {m.priority_flag === "push" ? "Push" : "Standard"}
                  </span>
                </div>
              ))}
            </div>
            {!acked && (
              <button onClick={acknowledge} className="mt-5 w-full rounded-2xl py-4 font-bold text-white inline-flex items-center justify-center gap-2" style={{ background: "var(--brand-green)" }}>
                <CheckCircle2 className="h-4 w-4" /> Got it — let's go
              </button>
            )}
            {acked && (
              <div className="mt-5 rounded-2xl py-3 text-center text-sm font-semibold text-brand-green" style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
                ✓ You acknowledged this week's focus
              </div>
            )}
          </>
        )}

        {/* Pairings section */}
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Suggested pairings</h2>
            <span className="text-xs text-muted-foreground">{pairings.length} total</span>
          </div>

          {pairings.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-white border border-border p-5 text-sm text-muted-foreground">
              Your manager hasn't generated pairings yet.
            </div>
          ) : (
            <>
              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a dish or drink"
                  className="w-full rounded-xl border border-border pl-9 pr-3 py-2 text-sm bg-white"
                />
              </div>

              {focusPairings.length > 0 && (
                <div className="mt-4">
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-orange mb-2">
                    <Target className="h-4 w-4" /> Focus for you — boost your weakest categories
                  </div>
                  <div className="space-y-2">{focusPairings.map((p) => renderPairing(p, true))}</div>
                </div>
              )}

              {otherPairings.length > 0 && (
                <div className="mt-4">
                  {focusPairings.length > 0 && (
                    <div className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">All pairings</div>
                  )}
                  <div className="space-y-2">{otherPairings.map((p) => renderPairing(p, false))}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ServerLayout>
  );
}
