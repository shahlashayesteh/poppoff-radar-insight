import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, TrendingUp, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/server", label: "My Stats", icon: Home },
  { to: "/server/menu", label: "Menu", icon: BookOpen },
  { to: "/server/progress", label: "Progress", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function ServerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 bg-ink text-white">
        <div className="mx-auto max-w-xl px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-md bg-success grid place-items-center text-ink font-bold text-sm">P</span>
            <span className="font-display font-semibold">Popp Off</span>
          </Link>
          <span className="text-xs text-white/60">The Demo Restaurant</span>
        </div>
      </header>
      <div className="mx-auto max-w-xl pb-24">{children}</div>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur border-t border-border">
        <div className="mx-auto max-w-xl grid grid-cols-4">
          {items.map((it) => {
            const active = path === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex flex-col items-center justify-center py-3 text-[11px] font-medium gap-1",
                  active ? "text-ink" : "text-muted-foreground"
                )}
              >
                <it.icon className={cn("h-5 w-5", active && "text-ink")} />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
