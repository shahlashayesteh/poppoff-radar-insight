import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { getMondayOfWeek, toISODate, formatWeekRange, performanceColour } from "@/lib/week";

export const Route = createFileRoute("/manager/team")({ component: TeamPage });

type Member = { id: string; full_name: string | null };

function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [loginCounts, setLoginCounts] = useState<Record<string, number>>({});
  const weekStart = toISODate(getMondayOfWeek());

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      const { data: vm } = await supabase.from("venue_members").select("user_id").eq("venue_id", v);
      const ids = (vm ?? []).map((x) => x.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        setMembers(profs ?? []);
      }
      const { data: st } = await supabase.from("server_stats").select("*").eq("venue_id", v).eq("week_start", weekStart);
      setStats(st ?? []);
      const { data: tg } = await supabase.from("server_targets").select("*").eq("venue_id", v);
      setTargets(tg ?? []);
      const { data: lg } = await supabase.from("server_logins").select("user_id").eq("venue_id", v);
      const counts: Record<string, number> = {};
      for (const r of (lg ?? [])) counts[r.user_id] = (counts[r.user_id] || 0) + 1;
      setLoginCounts(counts);
    })();
  }, [weekStart]);

  const sByUser = Object.fromEntries(stats.map((s) => [s.user_id, s]));
  const tByUser = Object.fromEntries(targets.map((t) => [t.user_id, t]));

  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Team</div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">Your servers</h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>

        {members.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white border border-border p-6 text-sm text-muted-foreground">
            No team members yet. Share your join code from the dashboard.
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m) => {
              const s = sByUser[m.id];
              const t = tByUser[m.id];
              const colour = s && t ? performanceColour(Number(s.spend_per_cover ?? 0), Number(t.spend_per_cover_target)) : "amber";
              const tone = colour === "green" ? "var(--brand-green)" : colour === "amber" ? "var(--brand-orange)" : "var(--opportunity)";
              return (
                <Link key={m.id} to="/manager/server/$id" params={{ id: m.id }} className="rounded-2xl bg-white border border-border p-5 hover:border-brand-green transition">
                  <div className="font-display text-lg font-bold">{m.full_name || "Unnamed"}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
                    <span className="text-sm">SPC £{s?.spend_per_cover ? Number(s.spend_per_cover).toFixed(0) : "—"}</span>
                    <span className="text-xs text-muted-foreground">/ £{t?.spend_per_cover_target ?? "—"}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{s ? `${s.total_covers} covers · £${Number(s.total_sales).toFixed(0)} sales` : "No stats yet"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{loginCounts[m.id] || 0} login{(loginCounts[m.id] || 0) === 1 ? "" : "s"}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
