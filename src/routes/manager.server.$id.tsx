import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/manager/server/$id")({
  component: ServerView,
});

function ServerView() {
  const { id } = Route.useParams();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "not_found" }
    | { kind: "ok"; fullName: string | null }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { if (!cancelled) setState({ kind: "not_found" }); return; }

      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("manager_id", uid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!venue) { if (!cancelled) setState({ kind: "not_found" }); return; }

      const { data: member } = await supabase
        .from("venue_members")
        .select("user_id")
        .eq("venue_id", venue.id)
        .eq("user_id", id)
        .maybeSingle();

      if (!member) { if (!cancelled) setState({ kind: "not_found" }); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", id)
        .maybeSingle();

      if (!cancelled) setState({ kind: "ok", fullName: profile?.full_name ?? null });
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <Link to="/manager" className="text-sm text-muted-foreground hover:text-ink">← Back to dashboard</Link>

        {state.kind === "loading" ? (
          <div className="mt-8 text-sm text-muted-foreground">Loading…</div>
        ) : state.kind === "not_found" ? (
          <div className="mt-8 rounded-2xl bg-white border border-border p-10 text-center">
            <div className="font-display text-xl font-semibold">Server not found in your team.</div>
            <p className="mt-2 text-sm text-muted-foreground">
              This user is not a member of your venue.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Server view</div>
              <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">
                {state.fullName ?? "Unnamed server"}
              </h1>
            </div>

            <div className="mt-8 rounded-2xl bg-white border border-border p-10 text-center">
              <div className="font-display font-bold">No data yet.</div>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Data will appear here once your team starts logging shifts.
              </p>
            </div>
          </>
        )}
      </div>
    </ManagerLayout>
  );
}
