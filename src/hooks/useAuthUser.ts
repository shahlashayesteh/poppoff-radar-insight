import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "manager" | "server" | null;

export type AuthState = {
  loading: boolean;
  user: User | null;
  role: AppRole;
  fullName: string | null;
  businessName: string | null;
  refresh: () => Promise<void>;
};

export function useAuthUser(): AuthState {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const u = session?.user ?? null;
    setUser(u);
    if (!u) {
      setRole(null);
      setFullName(null);
      setBusinessName(null);
      setLoading(false);
      return;
    }
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", u.id),
      supabase.from("profiles").select("full_name, business_name").eq("id", u.id).maybeSingle(),
    ]);
    const r = roles?.find((x) => x.role === "manager")
      ? "manager"
      : roles?.find((x) => x.role === "server")
        ? "server"
        : null;
    setRole(r);
    setFullName(profile?.full_name ?? null);
    setBusinessName(profile?.business_name ?? null);
    setLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void load(); });
    void load();
    return () => { sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, user, role, fullName, businessName, refresh: load };
}
