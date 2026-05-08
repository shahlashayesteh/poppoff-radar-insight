import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour } from "@/lib/week";

export const Route = createFileRoute("/server/stats")({ component: Page });

type Stat = any;
type Target = any;

const cats = [
  { key: "wine_conversion", t: "wine_target", label: "Wine" },
  { key: "cocktail_conversion", t: "cocktail_target", label: "Cocktails" },
  { key: "dessert_conversion", t: "dessert_target", label: "Desserts" },
  { key: "sides_conversion", t: "sides_target", label: "Sides" },
  { key: "spirits_conversion", t: "spirits_target", label: "Spirits" },
  { key: "sparkling_conversion", t: "sparkling_target", label: "Sparkling" },
];

function Page() {
  const [stat, setStat] = useState<Stat | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const weekStart = toISODate(getMondayOfWeek());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const venueId = vm?.[0]?.venue_id;
      if (!venueId) return;
      const { data: st } = await supabase.from("server_stats").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).eq("week_start", weekStart).maybeSingle();
      setStat(st);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("user_id", u.user.id).eq("venue_id", venueId).maybeSingle();
      setTarget(tg);
    })();
  }, [weekStart]);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>

        {!stat ? (
          <p className="mt-6 text-sm text-muted-foreground">Your stats will appear here after your manager uploads this week's data.</p>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-white border border-border p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Spend per cover</div>
                <div className="font-display text-2xl font-extrabold">£{Number(stat.spend_per_cover ?? 0).toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Target</div>
                <div className="font-semibold">£{target?.spend_per_cover_target ?? "—"}</div>
              </div>
            </div>
            {cats.map((c) => {
              const actual = Number(stat[c.key] ?? 0);
              const tgt = Number(target?.[c.t] ?? 0);
              const colour = performanceColour(actual, tgt);
              const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
              return (
                <div key={c.label} className="rounded-2xl bg-white border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-sm font-bold" style={{ color: tone }}>{actual.toFixed(0)}% / {tgt}%</div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full" style={{ width: `${Math.min(100, actual)}%`, background: tone }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ServerLayout>
  );
}
