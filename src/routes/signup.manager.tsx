import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup/manager")({
  validateSearch: (s: Record<string, unknown>): { priceId?: string } => ({
    priceId: typeof s.priceId === "string" ? s.priceId : undefined,
  }),
  component: SignupManager,
});

function SignupManager() {
  const navigate = useNavigate();
  const { priceId } = useSearch({ from: "/signup/manager" });
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const redirectTo = priceId
        ? `/checkout/start?priceId=${encodeURIComponent(priceId)}`
        : "/manager";
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + redirectTo,
          data: { full_name: fullName, business_name: businessName },
        },
      });
      if (error) throw error;
      // If session is created (auto-confirm off → user must verify email)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: redirectTo });
      } else {
        setError("Check your email to verify your account, then come back to continue.");
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-4 border-b border-border">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/" className="text-sm text-muted-foreground">← Back home</Link>
        </div>
      </header>

      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-center">
            Create your manager account
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Start your 30-day free trial. No credit card required.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              required value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm"
            />
            <input
              required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Restaurant / venue name"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm"
            />
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm"
            />
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit" disabled={busy}
              className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand-orange)" }}
            >
              {busy ? "Creating account…" : "Create account & continue"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" search={{ redirect: undefined }} className="font-semibold text-foreground underline">Sign in</Link>
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Are you a server?{" "}
            <Link to="/join" className="font-semibold text-foreground underline">Join with a code</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
