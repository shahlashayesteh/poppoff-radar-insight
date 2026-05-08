import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/server/profile")({ component: Page });

function Page() {
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/" }); };
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your profile and milestones will appear here.</p>
        <button onClick={signOut} className="mt-6 rounded-xl border border-border px-4 py-2 text-sm font-semibold">Sign out</button>
      </div>
    </ServerLayout>
  );
}
