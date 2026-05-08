import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  User,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  Target,
  FileBarChart,
  Settings as SettingsIcon,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; key?: string };
const items: NavItem[] = [
  { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/team", label: "Team", icon: Users },
  { to: "/manager/server", label: "Individual", icon: User },
  { to: "/manager/team", label: "Trends", icon: TrendingUp, key: "trends" },
  { to: "/manager/menu", label: "Menu Intelligence", icon: BookOpen },
  { to: "/manager/priorities", label: "Weekly Priorities", icon: CalendarCheck },
  { to: "/manager/coaching", label: "Coaching", icon: Target },
  { to: "/manager/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function ManagerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [initials, setInitials] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: prof } = await supabase.from("profiles").select("full_name, business_name").eq("id", data.user.id).maybeSingle();
      const n = prof?.full_name || data.user.email || "";
      setName(n);
      setBusinessName(prof?.business_name || "");
      const parts = String(n).trim().split(/\s+/).filter(Boolean);
      setInitials((parts[0]?.[0] || "") + (parts[1]?.[0] || ""));
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-border sticky top-0 h-screen">
        <div className="px-6 py-6">
          <Link to="/manager"><Logo className="text-2xl" /></Link>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {items.map((it) => {
            const active = it.exact ? path === it.to : path === it.to;
            return (
              <Link
                key={(("key" in it && it.key) || "") + it.to + it.label}
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
            <div className="h-8 w-8 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-xs font-bold uppercase">{initials || "·"}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{name || "Manager"}</div>
              <div className="text-[11px] text-muted-foreground truncate">{businessName || "General Manager"}</div>
            </div>
          </div>
          <a href="mailto:hello@poppoffstats.com" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" /> Need help?
          </a>
          <button onClick={signOut} className="w-full text-left flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
