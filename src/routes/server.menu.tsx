import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { getMondayOfWeek, toISODate } from "@/lib/week";
import { toast } from "sonner";

export const Route = createFileRoute("/server/menu")({ component: ServerMenu });

type Priority = { id: string; item_name: string; category: string | null; priority_flag: string };

function ServerMenu() {
  const [items, setItems] = useState<Priority[]>([]);
  const [acked, setAcked] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const weekStart = toISODate(getMondayOfWeek());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: vm } = await supabase.from("venue_members").select("venue_id").eq("user_id", u.user.id).limit(1);
      const v = vm?.[0]?.venue_id;
      if (!v) return;
      setVenueId(v);
      const { data: pr } = await supabase.from("weekly_priorities").select("*").eq("venue_id", v).eq("week_start", weekStart);
      setItems((pr ?? []) as Priority[]);
      const { data: ack } = await supabase.from("server_focus_acks").select("id").eq("user_id", u.user.id).eq("venue_id", v).eq("week_start", weekStart).maybeSingle();
      setAcked(!!ack);
    })();
  }, [weekStart]);

  const acknowledge = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !venueId) return;
    const { error } = await supabase.from("server_focus_acks").insert({ user_id: u.user.id, venue_id: venueId, week_start: weekStart });
    if (error) { toast.error(error.message); return; }
    setAcked(true);
    toast.success("Got it — let's go!");
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
      </div>
    </ServerLayout>
  );
}
