import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        const here = router.state.location.href;
        router.navigate({ to: "/login", search: { redirect: here } });
      } else {
        setChecked(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.navigate({ to: "/login", search: { redirect: "/" } });
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router]);

  if (!checked) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  return <Outlet />;
}
