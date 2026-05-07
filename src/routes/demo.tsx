import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { User, Shield, Briefcase, Building2 } from "lucide-react";

export const Route = createFileRoute("/demo")({
  component: Demo,
});

const roles = [
  { label: "Server", to: "/server", icon: User, sub: "Sarah · Front of house", c: "var(--brand-green)" },
  { label: "Manager", to: "/manager", icon: Shield, sub: "The Demo Restaurant", c: "var(--brand-orange)" },
  { label: "Smart Recs (Server)", to: "/server/welcome", icon: Briefcase, sub: "Personalised picks", c: "oklch(0.5 0.18 290)" },
  { label: "Streak (Server)", to: "/server/progress", icon: Building2, sub: "Milestones & rewards", c: "oklch(0.65 0.15 240)" },
];

function Demo() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-4 border-b border-border">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/" className="text-sm text-muted-foreground">← Back home</Link>
        </div>
      </header>

      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold">🔥 Demo access</div>
          <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight">Welcome to <Logo className="text-5xl" /></h1>
          <p className="mt-3 text-foreground/70">Pick a view to explore the prototype.</p>

          <div className="mt-10 grid sm:grid-cols-2 gap-3">
            {roles.map((r) => (
              <Link key={r.label} to={r.to} className="text-left flex items-center gap-3 rounded-2xl border border-border bg-white p-4 hover:border-brand-green transition">
                <span className="h-11 w-11 rounded-xl grid place-items-center"
                  style={{ background: `color-mix(in oklab, ${r.c} 14%, white)` }}>
                  <r.icon className="h-5 w-5" style={{ color: r.c }} />
                </span>
                <div className="flex-1">
                  <div className="font-bold text-sm">Login as {r.label}</div>
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
