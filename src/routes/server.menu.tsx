import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { claimServerCsvData } from "@/lib/server-data";
import { Sparkles, CheckCircle2, Search, Target } from "lucide-react";
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
        <p className="text-sm text-muted-foreground mt-1">This week's pairings and priorities.</p>

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
