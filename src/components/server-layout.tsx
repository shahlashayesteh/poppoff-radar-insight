import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, BarChart3, Target, Gift, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { RequireAuth } from "./RequireAuth";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/server", label: "Home", icon: Home },
  { to: "/server/progress", label: "Stats", icon: BarChart3 },
  { to: "/server/menu", label: "Coaching", icon: Target },
  { to: "/server/welcome", label: "Rewards", icon: Gift },
  { to: "/settings", label: "Profile", icon: User },
] as const;

export function ServerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [venueName, setVenueName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: m } = await supabase
        .from("venue_members")
        .select("venue:venues(name)")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      const v = m?.venue as { name: string } | { name: string }[] | null | undefined;
      const name = !v ? null : Array.isArray(v) ? (v[0]?.name ?? null) : v.name;
      if (!cancelled) setVenueName(name);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <RequireAuth role="server">
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-xl px-5 py-3 flex items-center justify-between">
          <Link to="/"><Logo className="text-xl" /></Link>
          <span className="text-[11px] text-muted-foreground">{venueName ?? ""}</span>
        </div>
      </header>
      <div className="mx-auto max-w-xl pb-24">{children}</div>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border">
        <div className="mx-auto max-w-xl grid grid-cols-5">
          {items.map((it) => {
            const active = path === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex flex-col items-center justify-center py-2.5 text-[11px] gap-1",
                  active ? "text-brand-green font-semibold" : "text-muted-foreground"
                )}
              >
                <it.icon className="h-5 w-5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
    </RequireAuth>
  );
}
