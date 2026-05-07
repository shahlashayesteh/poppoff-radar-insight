import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { JoinCodeCard } from "@/components/JoinCodeCard";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Calendar, Users } from "lucide-react";

export const Route = createFileRoute("/manager/")({
  component: ManagerDashboard,
});

type Venue = { id: string; name: string };
type Member = { user_id: string; joined_at: string };

function ManagerDashboard() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: v } = await supabase
        .from("venues")
        .select("id, name")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setVenue((v as Venue | null) ?? null);

      if (v?.id) {
        const { data: m } = await supabase
          .from("venue_members")
          .select("user_id, joined_at")
          .eq("venue_id", v.id);
        if (!cancelled) setMembers((m as Member[] | null) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight uppercase" style={{ color: "var(--brand-green)" }}>
              Manager Dashboard
            </div>
            <div className="text-sm text-muted-foreground tracking-widest uppercase">
              {venue ? venue.name : "Complete Visibility"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-muted-foreground" disabled>
              <Calendar className="h-4 w-4" /> No data yet
            </button>
            <button className="relative h-10 w-10 grid place-items-center rounded-full border border-border bg-white">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Join code */}
        <div className="mt-6">
          <JoinCodeCard />
        </div>

        {/* Team */}
        <div className="mt-6 rounded-2xl bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Team</h2>
            <span className="text-xs text-muted-foreground">
              {members.length} {members.length === 1 ? "server" : "servers"}
            </span>
          </div>
          <div className="p-8 text-center">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : members.length === 0 ? (
              <div className="space-y-2">
                <Users className="h-8 w-8 mx-auto text-muted-foreground" />
                <div className="font-semibold">No servers yet</div>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Share your join code above. Servers who sign up at <span className="font-semibold text-foreground">/join</span> will appear here.
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {members.length} server{members.length === 1 ? "" : "s"} have joined.
                Performance data will appear here once shifts are recorded.
              </div>
            )}
          </div>
        </div>

        {/* Empty state for analytics */}
        <div className="mt-6 rounded-2xl bg-white border border-border p-8 text-center">
          <h3 className="font-display font-bold">No performance data yet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Once your team starts logging shifts and sales, you'll see covers, spend per cover, uplift estimates, and coaching priorities here.
          </p>
        </div>

        <div className="mt-6 text-xs text-muted-foreground flex items-center justify-between">
          <span>ⓘ Metrics will update nightly once data is available.</span>
          <span><span className="font-bold" style={{ color: "var(--brand-orange)" }}>Popp</span><span className="font-bold" style={{ color: "var(--brand-green)" }}>Off</span>. Every shift. Every win.</span>
        </div>
      </div>
    </ManagerLayout>
  );
}
