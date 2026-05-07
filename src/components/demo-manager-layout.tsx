import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  FileBarChart,
  HelpCircle,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const items = [
  { to: "/demo/manager", label: "Dashboard", icon: LayoutDashboard },
  { to: "/demo/manager/team", label: "Team", icon: Users },
  { to: "/demo/manager/team", label: "Trends", icon: TrendingUp, key: "trends" },
  { to: "/demo/manager/menu", label: "Menu Intelligence", icon: BookOpen },
  { to: "/demo/manager/priorities", label: "Weekly Priorities", icon: CalendarCheck },
  { to: "/demo/manager", label: "Reports", icon: FileBarChart, key: "reports" },
];

export function DemoManagerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex bg-white">
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-border sticky top-0 h-screen">
        <div className="px-6 py-6">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-orange">Demo</div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {items.map((it) => {
            const active = it.to === "/demo/manager" ? path === "/demo/manager" : path === it.to;
            return (
              <Link
                key={(it.key ?? "") + it.to + it.label}
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
          <Link to="/demo" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to demo picker
          </Link>
          <Link to="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" /> Need help?
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
