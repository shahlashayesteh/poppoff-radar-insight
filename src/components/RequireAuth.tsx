import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useRole";

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: AppRole;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/login", search: { redirect: router.state.location.href } });
        return;
      }
      if (role) {
        const { data: r } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id)
          .eq("role", role)
          .maybeSingle();
        if (cancelled) return;
        if (!r) {
          // Wrong role — bounce to the right home
          const { data: anyRole } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.session.user.id)
            .maybeSingle();
          if (anyRole?.role === "manager") navigate({ to: "/manager" });
          else if (anyRole?.role === "server") navigate({ to: "/server" });
          else navigate({ to: "/login", search: { redirect: undefined } });
          return;
        }
      }
      setOk(true);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) navigate({ to: "/login", search: { redirect: undefined } });
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [navigate, router, role]);

  if (!ok) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}
