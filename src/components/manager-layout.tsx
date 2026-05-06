import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
  TrendingUp,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/team", label: "Team Trends", icon: TrendingUp },
  { to: "/manager/server/sarah", label: "Server View", icon: Users },
  { to: "/manager/menu", label: "Menu Intelligence", icon: BookOpen },
  { to: "/manager/priorities", label: "Weekly Priorities", icon: CalendarCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function ManagerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex bg-canvas">
      <aside className="hidden md:flex w-64 flex-col bg-ink text-white sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-success grid place-items-center text-ink font-bold">P</span>
            <div>
              <div className="font-display text-lg font-semibold leading-none">Popp Off</div>
              <div className="text-[11px] text-white/50 mt-1">The Demo Restaurant</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((it) => {
            const active = path === it.to || (it.to !== "/manager" && path.startsWith(it.to));
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active ? "bg-white text-ink font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <it.icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link to="/login" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5">
            <LogOut className="h-4 w-4" /> Sign out
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
