import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";
import { notifySignup } from "@/lib/email/send";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { toast } from "sonner";

export const Route = createFileRoute("/signup/manager")({
  component: SignUpManager,
  head: () => ({ meta: [{ title: "Create your account — PoppOff" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ priceId: (s.priceId as string) || "" }),
});

function SignUpManager() {
  const { priceId } = Route.useSearch();
  const navigate = useNavigate();
  const { openCheckout } = usePaddleCheckout();
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!priceId) {
      try {
        const stored = localStorage.getItem("poppoff_pending_price_id");
        if (stored) navigate({ to: "/signup/manager", search: { priceId: stored }, replace: true });
      } catch {}
    }
  }, [priceId, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, business_name: businessName, plan_price_id: priceId },
      },
    });
    if (error) {
      if (/registered|exists/i.test(error.message)) {
        toast.error("Account already exists. Sign in instead.");
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }
    // Sign in immediately (auto-confirm is on)
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        toast.error(signInErr.message);
        setLoading(false);
        return;
      }
    }
    // Ensure profile updated with full_name & business_name (handle_new_user trigger reads metadata,
    // but if it ran before metadata was set, write it now)
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("profiles").upsert({
        id: u.user.id,
        full_name: fullName,
        business_name: businessName,
      });
    }
    const { error: claimErr } = await supabase.rpc("claim_manager_account", { _business_name: businessName });
    if (claimErr) {
      toast.error(claimErr.message);
      setLoading(false);
      return;
    }
    try { localStorage.removeItem("poppoff_pending_price_id"); } catch {}
    if (u.user) {
      void notifySignup({
        role: "manager",
        fullName,
        email,
        businessOrVenue: businessName,
        userId: u.user.id,
      });
    }
    toast.success("Welcome to PoppOff!");
    navigate({ to: "/manager" });
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/signin" className="text-sm text-muted-foreground">Already have an account? Sign in</Link>
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl bg-white border border-border p-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Set up your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Payment received. Just a few details to finish.</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" placeholder="Business / venue name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <button disabled={loading} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--brand-orange)" }}>
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
