import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, BarChart3, Target, Gift, User } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/server", label: "Home", icon: Home },
  { to: "/server/progress", label: "Stats", icon: BarChart3 },
  { to: "/server/menu", label: "Coaching", icon: Target },
  { to: "/server/welcome", label: "Rewards", icon: Gift },
  { to: "/settings", label: "Profile", icon: User },
];

export function ServerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [venueName, setVenueName] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (role === "manager") { navigate({ to: "/manager" }); return; }
    if (role !== "server") { navigate({ to: "/login" }); return; }

    (async () => {
      const { data: vm } = await supabase
        .from("venue_members")
        .select("venues(name)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      setVenueName((vm as any)?.venues?.name ?? null);
    })();
  }, [user, role, loading, navigate]);

  if (loading || !user || role !== "server") {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
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
  );
}
