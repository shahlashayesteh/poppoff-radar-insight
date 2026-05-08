import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Role = "manager" | "server";

export function useAuthedUser() {
  const [user, setUser] = useState<{ id: string; email?: string } | null | undefined>(undefined);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email ?? undefined } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return user; // undefined = loading, null = signed out
}

export function useRoleGate(required: Role) {
  const navigate = useNavigate();
  const user = useAuthedUser();
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      navigate({ to: "/signin" });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (cancelled) return;
      const roles = (data ?? []).map((r) => r.role) as Role[];
      if (roles.includes(required)) {
        setRole(required);
      } else if (roles.includes("manager")) {
        navigate({ to: "/manager" });
      } else if (roles.includes("server")) {
        navigate({ to: "/server" });
      } else {
        navigate({ to: "/signin" });
      }
    })();
    return () => { cancelled = true; };
  }, [user, required, navigate]);
  return { user, role };
}

export async function signOutAndGoHome(navigate: ReturnType<typeof useNavigate>) {
  await supabase.auth.signOut();
  navigate({ to: "/" });
}
