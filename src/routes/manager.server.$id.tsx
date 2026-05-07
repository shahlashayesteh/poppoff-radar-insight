import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/manager/server/$id")({
  component: ServerView,
});

function ServerView() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: v } = await supabase.from("venues").select("id").eq("manager_id", user.id).limit(1).maybeSingle();
      if (!v) { navigate({ to: "/manager/team" }); return; }
      const { data: member } = await supabase
        .from("venue_members")
        .select("user_id")
        .eq("venue_id", (v as any).id)
        .eq("user_id", id)
        .maybeSingle();
      if (!member) { navigate({ to: "/manager/team" }); return; }
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
      setName((p as any)?.full_name ?? "Server");
      setLoaded(true);
    })();
  }, [user, id, navigate]);

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-4xl">
        <Link to="/manager/team" className="text-sm text-muted-foreground hover:text-foreground">← Back to team</Link>
        {loaded && (
          <>
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">{name}</h1>
            <div className="mt-8 rounded-2xl bg-white border border-border p-8 text-center text-sm text-muted-foreground">
              No performance data yet for this server.
            </div>
          </>
        )}
      </div>
    </ManagerLayout>
  );
}
