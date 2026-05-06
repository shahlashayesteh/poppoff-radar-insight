import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Shield, Briefcase, Building2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

const roles = [
  { label: "Login as Server", to: "/server/welcome", icon: User, sub: "Sarah · Front of house" },
  { label: "Login as Manager", to: "/manager", icon: Shield, sub: "The Demo Restaurant" },
  { label: "Login as Assistant Manager", to: "/manager", icon: Briefcase, sub: "Service support" },
  { label: "Login as Head Office", to: "/manager/team", icon: Building2, sub: "Group view" },
];

function Login() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      <div className="hidden lg:flex gradient-hero text-white p-12 flex-col justify-between">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-success grid place-items-center text-ink font-bold">P</span>
          <span className="font-display font-semibold text-lg">Popp Off</span>
        </div>
        <div>
          <h1 className="font-display text-5xl font-semibold tracking-tight leading-[1.05]">
            Personal stats for every server.
          </h1>
          <p className="mt-4 text-white/70 max-w-md">
            Sign in to see this week's focus, AI coaching, and menu-specific recommendations.
          </p>
        </div>
        <div className="text-xs text-white/50">© 2026 Popp Off</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
          <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground mt-1">Sign in to your scorecard.</p>

          <div className="mt-8 space-y-4 opacity-60">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@restaurant.com" disabled />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" placeholder="••••••••" disabled />
            </div>
            <Button disabled className="w-full">Sign in</Button>
          </div>

          <div className="my-8 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> Demo access <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            {roles.map((r) => (
              <Link key={r.label} to={r.to} className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 hover:border-ink transition">
                <span className="h-9 w-9 rounded-lg bg-ink text-white grid place-items-center">
                  <r.icon className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.sub}</div>
                </div>
                <span className="text-muted-foreground">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
