import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  FileBarChart,
  Settings as SettingsIcon,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/team", label: "Team", icon: Users },
  { to: "/manager/trends", label: "Trends", icon: TrendingUp },
  { to: "/manager/menu", label: "Menu Intelligence", icon: BookOpen },
  { to: "/manager/priorities", label: "Weekly Priorities", icon: CalendarCheck },
  { to: "/manager/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function ManagerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [profile, setProfile] = useState<{ full_name: string | null; business_name: string | null } | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (role === "server") { navigate({ to: "/server" }); return; }
    if (role !== "manager") { navigate({ to: "/login" }); return; }

    (async () => {
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from("profiles").select("full_name,business_name").eq("id", user.id).maybeSingle(),
        supabase.from("venues").select("name").eq("manager_id", user.id).order("created_at").limit(1).maybeSingle(),
      ]);
      setProfile(p as any);
      setVenueName((v as any)?.name ?? null);
    })();
  }, [user, role, loading, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (loading || !user || role !== "manager") {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  const initials = (profile?.full_name ?? "")
    .split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "M";

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-border sticky top-0 h-screen">
        <div className="px-6 py-6">
          <Link to="/"><Logo className="text-2xl" /></Link>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {items.map((it) => {
            const active = it.to === "/manager" ? path === "/manager" : path === it.to;
            return (
              <Link
                key={it.to + it.label}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-brand-green/10 text-brand-green font-semibold"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                <it.icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
            <div className="h-8 w-8 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-xs font-bold">{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{profile?.full_name ?? "Manager"}</div>
              <div className="text-[11px] text-muted-foreground truncate">{venueName ?? profile?.business_name ?? ""}</div>
            </div>
          </div>
          <Link to="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" /> Need help?
          </Link>
          <button onClick={signOut} className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
