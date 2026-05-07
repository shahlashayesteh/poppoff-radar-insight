import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

export const Route = createFileRoute("/manager/team")({
  component: TeamPage,
});

type Row = { user_id: string; joined_at: string; full_name: string | null };

function TeamPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { if (!cancelled) setRows([]); return; }

      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("manager_id", uid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!venue) { if (!cancelled) setRows([]); return; }

      const { data: members } = await supabase
        .from("venue_members")
        .select("user_id, joined_at")
        .eq("venue_id", venue.id);

      const ids = (members ?? []).map((m) => m.user_id);
      let profileMap: Record<string, string | null> = {};
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        for (const p of profiles ?? []) profileMap[p.id] = p.full_name;
      }

      if (!cancelled) {
        setRows((members ?? []).map((m) => ({
          user_id: m.user_id,
          joined_at: m.joined_at,
          full_name: profileMap[m.user_id] ?? null,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Team</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">Your servers</h1>

        <div className="mt-8 rounded-2xl bg-white border border-border">
          {rows === null ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="font-semibold">No servers have joined yet.</div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.user_id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{r.full_name ?? "Unnamed server"}</div>
                    <div className="text-xs text-muted-foreground">
                      Joined {new Date(r.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-8 text-center">
          <h3 className="font-display font-bold">No data yet.</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Data will appear here once your team starts logging shifts.
          </p>
        </div>
      </div>
    </ManagerLayout>
  );
}
