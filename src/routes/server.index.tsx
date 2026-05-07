import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/server/")({
  component: ServerDashboard,
});

function ServerDashboard() {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      setName((p as any)?.full_name ?? null);
    })();
  }, [user]);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="text-sm">
          <span className="text-xl">👋</span> <span className="font-medium">Welcome, {name ?? ""}</span>
        </div>

        <div className="mt-6 rounded-3xl bg-white border border-border p-6 text-center">
          <div className="font-display text-xl font-extrabold">Your stats</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your stats will appear here after your manager uploads this week's data.
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-white border border-border p-6 text-center">
          <div className="font-display text-xl font-extrabold">Streak 🔥</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your streak starts when you hit your first weekly target.
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-white border border-border p-6 text-center">
          <div className="font-display text-xl font-extrabold">Milestones</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete your first week to unlock milestones.
          </p>
        </div>
      </div>
    </ServerLayout>
  );
}
