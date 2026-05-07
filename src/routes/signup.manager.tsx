import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

type Search = { priceId?: string };

export const Route = createFileRoute("/signup/manager")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    priceId: typeof s.priceId === "string" ? s.priceId : undefined,
  }),
  component: ManagerSignup,
});

function ManagerSignup() {
  const navigate = useNavigate();
  const { priceId } = Route.useSearch();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resolvedPriceId = priceId ?? "poppoff_starter_monthly";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Sign up (or sign in if already exists)
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, business_name: businessName },
        emailRedirectTo: `${window.location.origin}/checkout/success`,
      },
    });

    let userId = signUpData?.user?.id ?? null;

    if (signUpErr) {
      // If user already exists, try sign in
      if (signUpErr.message?.toLowerCase().includes("registered") || signUpErr.message?.toLowerCase().includes("already")) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr || !signInData.user) {
          setError("An account with this email already exists. Please sign in.");
          setLoading(false);
          return;
        }
        userId = signInData.user.id;
      } else {
        setError(signUpErr.message);
        setLoading(false);
        return;
      }
    }

    if (!userId) {
      // Need session for customData; try sign in
      const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
      userId = signInData?.user?.id ?? null;
    }

    if (!userId) {
      setError("Could not create account. Please try again.");
      setLoading(false);
      return;
    }

    try {
      await openCheckout({
        priceId: resolvedPriceId,
        customerEmail: email,
        customData: { userId, role: "manager", businessName },
        successUrl: `${window.location.origin}/checkout/success`,
      });
    } catch (e: any) {
      setError(e?.message ?? "Could not open checkout");
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {resolvedPriceId === "poppoff_starter_monthly"
              ? "Starter plan · 30-day free trial. No credit card charged today."
              : "Pro plan · billed monthly from today."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="Your name" value={fullName} onChange={setFullName} />
            <Field label="Business name" value={businessName} onChange={setBusinessName} />
            <Field label="Email" type="email" value={email} onChange={setEmail} />
            <Field label="Password" type="password" value={password} onChange={setPassword} minLength={8} />
            {error && <div className="text-sm text-opportunity">{error}</div>}
            <button
              disabled={loading || checkoutLoading}
              className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand-orange)" }}
            >
              {loading || checkoutLoading ? "Opening checkout…" : "Continue to checkout"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="font-semibold text-brand-green">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", minLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; minLength?: number }) {
  return (
    <div>
      <label className="text-sm font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        required
        minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm"
      />
    </div>
  );
}
