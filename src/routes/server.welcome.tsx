import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import { getActiveVenueIdForUser } from "@/lib/active-venue";
import { Sparkles, TrendingUp, ChevronRight } from "lucide-react";
import { getMondayOfWeek, toISODate, latestStatsWeek } from "@/lib/week";
import {
  loadServerPerformance,
  itemsToTarget,
  type CategoryMetric,
  type ServerPerformance,
} from "@/lib/performance-engine";

export const Route = createFileRoute("/server/welcome")({ component: SmartRecs });

type Pick = {
  name: string;
  blurb: string;
  note?: string;
  badge: "Best" | "New" | "Easy" | "Close" | "Hot" | "VIP";
  emoji: string;
};

const EMOJI: Record<string, string> = {
  wine: "🍷", cocktail: "🍸", dessert: "🍰", sides: "🍟",
  spirits: "🥃", sparkling: "🥂", water: "💧", beer: "🍺", coffee: "☕",
};
function emojiFor(category: string, name: string): string {
  const n = name.toLowerCase();
  if (n.includes("water")) return "💧";
  if (n.includes("espresso") || n.includes("coffee")) return "☕";
  if (n.includes("fries") || n.includes("chip")) return "🍟";
  if (n.includes("martini")) return "🍸";
  if (n.includes("champagne") || n.includes("prosecco")) return "🥂";
  if (n.includes("whisky") || n.includes("whiskey") || n.includes("rum")) return "🥃";
  if (n.includes("beer") || n.includes("lager") || n.includes("ipa")) return "🍺";
  const c = category.toLowerCase();
  for (const k of Object.keys(EMOJI)) if (c.includes(k)) return EMOJI[k];
  return "✨";
}
function badgeStyle(b: Pick["badge"]) {
  if (b === "Best") return { bg: "var(--brand-green)", fg: "white" };
  if (b === "New") return { bg: "var(--brand-orange)", fg: "white" };
  if (b === "Hot") return { bg: "var(--opportunity)", fg: "white" };
  if (b === "VIP") return { bg: "color-mix(in oklab, var(--brand-orange) 80%, black)", fg: "white" };
  if (b === "Close") return { bg: "color-mix(in oklab, var(--brand-orange) 18%, white)", fg: "var(--brand-orange)" };
  return { bg: "color-mix(in oklab, var(--brand-green) 18%, white)", fg: "var(--brand-green)" };
}

function SmartRecs() {
  useRoleGate("server");
  const [perf, setPerf] = useState<ServerPerformance | null>(null);
  const [menuItems, setMenuItems] = useState<Array<{ name: string; category: string; price: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const userId = u.user.id;
      const venueId = await getActiveVenueIdForUser(userId);
      if (!venueId) { setLoading(false); return; }

      const weekStart = toISODate(getMondayOfWeek());
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at")
          .eq("user_id", userId).eq("venue_id", venueId)
          .order("created_at", { ascending: false })
          .order("week_start", { ascending: false }).limit(1),
        weekStart,
      );

      const [p, menuRes] = await Promise.all([
        loadServerPerformance({ venueId, userId, weekStart: visibleWeek }),
        supabase.from("venue_menu").select("parsed_items")
          .eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(1),
      ]);
      setPerf(p);
      const items = (menuRes.data?.[0] as any)?.parsed_items;
      if (Array.isArray(items)) {
        const parsed = items
          .map((it: any) => ({
            name: String(it?.name || "").trim(),
            category: String(it?.category || "").toLowerCase(),
            price: Number(String(it?.price || "").replace(/[^0-9.]/g, "")) || 0,
          }))
          .filter((x) => x.name && x.category);
        setMenuItems(parsed);
      }
      setLoading(false);
    })();
  }, []);

  // Opportunity lift = sum across under-target categories of (gap% * opportunity * avg price)
  const opportunityLift = useMemo(() => {
    if (!perf) return 0;
    let total = 0;
    for (const r of perf.rows) {
      if (!r.target || r.current >= r.target) continue;
      const opp = r.opportunityCount ?? null;
      const price = r.avgUnitPrice;
      if (opp && price) {
        total += ((r.target - r.current) / 100) * opp * price;
      } else if (r.sales > 0 && r.current > 0) {
        // Fallback: scale current sales proportionally
        total += r.sales * ((r.target - r.current) / r.current);
      }
    }
    return Math.max(0, Math.round(total));
  }, [perf]);

  const picks: Pick[] = useMemo(() => {
    if (!perf) return [];
    const rows = perf.rows;
    if (!rows.length) return [];

    // 1) Best — strongest revenue influence category (or highest score)
    const best = rows.slice().sort((a, b) =>
      (b.revenueInfluence ?? -Infinity) - (a.revenueInfluence ?? -Infinity) || b.score - a.score,
    )[0];
    // 2) New — weakest under-target category to push
    const weakest = rows
      .filter((r) => r.target > 0 && r.current < r.target)
      .sort((a, b) => a.ringPct - b.ringPct)[0];
    // 3) Easy — close-to-target (within a few items) or low-friction water
    const closeOne = rows
      .map((r) => ({ r, need: itemsToTarget(r) }))
      .filter((x) => x.need !== null && x.need! > 0 && x.need! <= 5)
      .sort((a, b) => (a.need ?? 99) - (b.need ?? 99))[0]?.r;

    const itemFor = (cat: CategoryMetric | undefined, preferHigh: boolean): { name: string; price: number } | null => {
      if (!cat) return null;
      const key = cat.key.toLowerCase();
      const matches = menuItems.filter((m) =>
        m.category.includes(key) || key.includes(m.category.split(/[^a-z]+/)[0] ?? ""),
      );
      if (!matches.length) return null;
      const sorted = matches.slice().sort((a, b) => preferHigh ? b.price - a.price : a.price - b.price);
      return sorted[0];
    };

    const out: Pick[] = [];
    const usedNames = new Set<string>();

    const bestItem = itemFor(best, true);
    if (best && bestItem) {
      usedNames.add(bestItem.name);
      const mom = (best.deltaVs4wk ?? best.deltaWoW ?? 0);
      out.push({
        name: bestItem.name,
        blurb: "High-margin, high signal",
        note: mom > 0 ? `+${Math.round(mom)}% vs usual` : `Top earner this week`,
        badge: "Best",
        emoji: emojiFor(best.key, bestItem.name),
      });
    }

    const weakItem = itemFor(weakest, true);
    if (weakest && weakItem && !usedNames.has(weakItem.name)) {
      usedNames.add(weakItem.name);
      out.push({
        name: weakItem.name,
        blurb: `Push ${weakest.label.toLowerCase()} — high upsell`,
        note: "Recommend it!",
        badge: "New",
        emoji: emojiFor(weakest.key, weakItem.name),
      });
    }

    const closeItem = itemFor(closeOne, false);
    if (closeOne && closeItem && !usedNames.has(closeItem.name)) {
      const need = itemsToTarget(closeOne);
      usedNames.add(closeItem.name);
      out.push({
        name: closeItem.name,
        blurb: need ? `${need} more to hit target` : "Easy win. Add it up.",
        badge: "Close",
        emoji: emojiFor(closeOne.key, closeItem.name),
      });
    }

    // Fill to 3 with bottled-water style easy add if menu has it
    if (out.length < 3) {
      const water = menuItems.find((m) => m.name.toLowerCase().includes("water"));
      if (water && !usedNames.has(water.name)) {
        usedNames.add(water.name);
        out.push({
          name: water.name,
          blurb: "Easy win. Add it up.",
          badge: "Easy",
          emoji: "💧",
        });
      }
    }
    // Fallback: pick any top-priced unused menu item
    while (out.length < 3 && menuItems.length) {
      const next = menuItems
        .filter((m) => !usedNames.has(m.name))
        .sort((a, b) => b.price - a.price)[0];
      if (!next) break;
      usedNames.add(next.name);
      out.push({
        name: next.name,
        blurb: "Trending pick this week",
        badge: "Hot",
        emoji: emojiFor(next.category, next.name),
      });
    }

    return out.slice(0, 3);
  }, [perf, menuItems]);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-7 w-7 text-brand-orange shrink-0 mt-1" />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-extrabold tracking-tight leading-tight">Smart recs for you</h1>
            <p className="mt-1 text-sm text-muted-foreground">Personalised picks to boost your week</p>
          </div>
          <div className="h-12 w-12 rounded-full border border-border grid place-items-center">
            <TrendingUp className="h-5 w-5 text-brand-green" />
          </div>
        </div>

        {/* Opportunity card */}
        <div className="mt-5 rounded-3xl border border-border p-6 relative overflow-hidden"
          style={{ background: "color-mix(in oklab, var(--brand-orange) 7%, white)" }}>
          <div className="text-sm font-semibold">This week's opportunity</div>
          <div className="font-display text-6xl font-extrabold mt-2">
            {opportunityLift > 0 ? `+£${opportunityLift}` : "—"}
          </div>
          <div className="text-lg font-semibold">potential lift</div>
          <p className="mt-3 text-sm text-foreground/80 max-w-[60%]">
            {opportunityLift > 0
              ? "Focus on these high-performing menu items."
              : "Log this week's stats to unlock your opportunity."}
          </p>
          <div className="absolute right-4 top-6 text-5xl">📈</div>
        </div>

        {/* Top picks */}
        <div className="mt-6 flex items-center justify-between">
          <div className="font-semibold">Top picks for you 🔥</div>
          <span className="text-sm text-brand-green font-semibold">{picks.length} action{picks.length === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-3 space-y-3">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading your picks…</p>
          )}
          {!loading && picks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No picks yet — add your menu and log a week of stats to unlock smart recs.
            </p>
          )}
          {picks.map((p) => {
            const bs = badgeStyle(p.badge);
            return (
              <div key={p.name} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
                <div className="h-14 w-14 rounded-xl grid place-items-center text-2xl shrink-0"
                  style={{ background: "color-mix(in oklab, var(--brand-orange) 8%, white)" }}>{p.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.blurb}</div>
                  {p.note && <div className="text-xs text-brand-green font-semibold mt-1">↗ {p.note}</div>}
                </div>
                <span className="text-xs font-bold rounded-lg px-3 py-1.5 shrink-0"
                  style={{ background: bs.bg, color: bs.fg }}>{p.badge}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>

        <Link to="/server" className="mt-5 mb-6 block w-full rounded-2xl py-4 text-center font-display text-lg font-bold bg-brand-orange text-white">
          Let's go! 🚀
        </Link>
      </div>
    </ServerLayout>
  );
}
