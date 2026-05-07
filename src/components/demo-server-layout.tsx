import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BarChart3, Target, Gift, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const items = [
  { to: "/demo/server", label: "Home", icon: Home },
  { to: "/demo/server/progress", label: "Stats", icon: BarChart3 },
  { to: "/demo/server/menu", label: "Coaching", icon: Target },
  { to: "/demo/server/welcome", label: "Rewards", icon: Gift },
  { to: "/demo", label: "Exit", icon: ArrowLeft },
];

export function DemoServerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-xl px-5 py-3 flex items-center justify-between">
          <Link to="/"><Logo className="text-xl" /></Link>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-orange">Demo</span>
        </div>
      </header>
      <div className="mx-auto max-w-xl pb-24">{children}</div>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border">
        <div className="mx-auto max-w-xl grid grid-cols-5">
          {items.map((it) => {
            const active = path === it.to;
            return (
              <Link
                key={it.to + it.label}
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
