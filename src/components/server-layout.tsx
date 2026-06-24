import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BarChart3, Target, Trophy, Gift, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const items = [
  { to: "/server", label: "Home", icon: Home },
  { to: "/server/stats", label: "Stats", icon: BarChart3 },
  { to: "/server/leaderboard", label: "Ranks", icon: Trophy },
  { to: "/server/coaching", label: "Coaching", icon: Target },
  { to: "/server/rewards", label: "Rewards", icon: Gift },
  { to: "/server/profile", label: "Profile", icon: User },
];

export function ServerLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isDemo = path.startsWith("/demo");
  const prefix = (to: string) => (isDemo ? `/demo${to}` : to);
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-xl px-5 py-3 flex items-center justify-between">
          <Link to="/"><Logo className="text-xl" /></Link>
          <span className="text-[11px] text-muted-foreground">The Demo Restaurant</span>
        </div>
      </header>
      <div className="mx-auto max-w-xl pb-24">{children}</div>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border">
        <div className="mx-auto max-w-xl grid grid-cols-6">
          {items.map((it) => {
            const target = prefix(it.to);
            const active = path === target;
            return (
              <a
                key={it.to}
                href={target}
                className={cn(
                  "flex flex-col items-center justify-center py-2.5 text-[11px] gap-1",
                  active ? "text-brand-green font-semibold" : "text-muted-foreground"
                )}
              >
                <it.icon className="h-5 w-5" />
                {it.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
