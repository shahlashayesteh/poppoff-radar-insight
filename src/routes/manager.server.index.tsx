import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/manager/server/")({ component: Page });

function Page() {
  const [members, setMembers] = useState<{ id: string; full_name: string | null }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: venues } = await supabase.from("venues").select("id").eq("manager_id", u.user.id).limit(1);
      const venueId = venues?.[0]?.id;
      if (!venueId) return;
      const { data: vm } = await supabase.from("venue_members").select("user_id").eq("venue_id", venueId);
      const ids = (vm ?? []).map((x) => x.user_id);
      if (ids.length === 0) { setMembers([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setMembers(profs ?? []);
    })();
  }, []);
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Individual servers</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pick a server to see their detailed scorecard.</p>
        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          {members.length === 0 && <div className="text-sm text-muted-foreground">No team members yet. Share your venue join code so servers can sign up.</div>}
          {members.map((m) => (
            <Link key={m.id} to="/manager/server/$id" params={{ id: m.id }} className="rounded-2xl border border-border bg-white p-4 hover:border-brand-green">
              <div className="font-semibold text-sm">{m.full_name || "Unnamed server"}</div>
              <div className="text-xs text-muted-foreground mt-1">View scorecard →</div>
            </Link>
          ))}
        </div>
      </div>
    </ManagerLayout>
  );
}
