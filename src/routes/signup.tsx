import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { Shield, User } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignUpChooser,
  head: () => ({ meta: [{ title: "Sign up — PoppOff" }] }),
});

function SignUpChooser() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/signin" className="text-sm text-muted-foreground">Already have an account? Sign in</Link>
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-2xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Create your account</h1>
          <p className="mt-2 text-foreground/70">Choose how you'll use PoppOff.</p>
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            <a href="/#pricing" className="text-left rounded-2xl border border-border bg-white p-6 hover:border-brand-orange transition">
              <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: "color-mix(in oklab, var(--brand-orange) 14%, white)" }}>
                <Shield className="h-5 w-5" style={{ color: "var(--brand-orange)" }} />
              </span>
              <div className="mt-4 font-bold text-lg">I'm a Manager</div>
              <div className="mt-1 text-sm text-muted-foreground">Set up your venue, invite your team, and start coaching.</div>
            </a>
            <Link to="/join" className="text-left rounded-2xl border border-border bg-white p-6 hover:border-brand-green transition">
              <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)" }}>
                <User className="h-5 w-5" style={{ color: "var(--brand-green)" }} />
              </span>
              <div className="mt-4 font-bold text-lg">I'm a Server</div>
              <div className="mt-1 text-sm text-muted-foreground">Join your team using the access code from your manager.</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
