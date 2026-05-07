import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/manager/team")({
  component: TeamPage,
});

type Member = { user_id: string; full_name: string | null };

function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: v } = await supabase.from("venues").select("id").eq("manager_id", user.id).limit(1).maybeSingle();
      if (!v) { setLoaded(true); return; }
      const { data: vm } = await supabase
        .from("venue_members")
        .select("user_id, profiles(full_name)")
        .eq("venue_id", (v as any).id);
      setMembers(((vm ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        full_name: r.profiles?.full_name ?? null,
      })));
      setLoaded(true);
    })();
  }, [user]);

  return (
    <ManagerLayout>
      <div className="px-8 py-7 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Team</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everyone who's joined your venue.</p>

        <div className="mt-6 rounded-2xl bg-white border border-border">
          {!loaded ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : members.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No servers have joined yet. Share your join code to get started.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.user_id}>
                  <Link
                    to="/manager/server/$id"
                    params={{ id: m.user_id }}
                    className="flex items-center justify-between px-5 py-4 text-sm font-medium hover:bg-muted/40"
                  >
                    <span>{m.full_name ?? "Server"}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}
