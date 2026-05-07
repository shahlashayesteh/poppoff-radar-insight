import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/demo")({
  component: DemoLayout,
});

const items = [
  { to: "/demo",            label: "Dashboard",         icon: LayoutDashboard },
  { to: "/demo/team",       label: "Team",              icon: Users },
  { to: "/demo/menu",       label: "Menu Intelligence", icon: BookOpen },
  { to: "/demo/priorities", label: "Weekly Priorities", icon: CalendarCheck },
] as const;

function DemoLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Demo banner */}
      <div className="w-full text-white text-center text-sm py-2 px-4" style={{ background: "var(--brand-green)" }}>
        <span className="font-semibold">You're viewing a live demo</span> — sample data, no account required.{" "}
        <Link to="/login" search={{ redirect: undefined }} className="underline font-bold ml-1">
          Sign up to start your pilot →
        </Link>
        <Link to="/" className="ml-4 underline opacity-90">Back to site</Link>
      </div>

      <div className="flex-1 flex">
        <aside className="hidden md:flex w-60 flex-col bg-white border-r border-border sticky top-[34px] h-[calc(100vh-34px)]">
          <div className="px-6 py-6">
            <Link to="/"><Logo className="text-2xl" /></Link>
          </div>
          <nav className="flex-1 px-3 py-2 space-y-1">
            {items.map((it) => {
              const active = it.to === "/demo" ? path === "/demo" : path === it.to;
              return (
                <Link
                  key={it.to}
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
          <div className="p-3 border-t border-border">
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="block w-full rounded-xl px-3 py-2.5 text-center text-sm font-bold text-white"
              style={{ background: "var(--brand-orange)" }}
            >
              Start your pilot
            </Link>
          </div>
        </aside>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
