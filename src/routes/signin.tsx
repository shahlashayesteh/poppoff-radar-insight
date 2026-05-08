import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/signin")({
  component: SignIn,
  head: () => ({ meta: [{ title: "Sign in — PoppOff" }] }),
});

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      toast.error(error?.message || "Invalid credentials");
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const r = (roles ?? []).map((x) => x.role);
    if (r.includes("manager")) navigate({ to: "/manager" });
    else if (r.includes("server")) navigate({ to: "/server" });
    else navigate({ to: "/checkout/retry" });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/" className="text-sm text-muted-foreground">← Back home</Link>
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl bg-white border border-border p-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your PoppOff account.</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button disabled={loading} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--brand-orange)" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div className="mt-5 space-y-2 text-sm">
            <div><span className="text-muted-foreground">Server? </span><Link to="/join" className="font-semibold text-brand-green">Join your venue</Link></div>
            <div><span className="text-muted-foreground">New restaurant? </span><Link to="/" hash="pricing" className="font-semibold text-brand-orange">Start your free trial</Link></div>
          </div>
        </div>
      </div>
    </div>
  );
}
