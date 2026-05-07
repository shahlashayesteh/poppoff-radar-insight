import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signErr || !data.user) {
      setError(signErr?.message ?? "Sign in failed");
      setLoading(false);
      return;
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    const role = roleRow?.role;
    if (role === "manager") navigate({ to: "/manager" });
    else if (role === "server") navigate({ to: "/server" });
    else {
      await supabase.auth.signOut();
      setError("Account setup incomplete. Please contact support.");
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
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-center">Welcome back</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">Sign in to your PoppOff account.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-semibold">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-semibold">Password</label>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm"
              />
            </div>
            {error && <div className="text-sm text-opportunity">{error}</div>}
            <button
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand-orange)" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Server? <Link to="/join" className="font-semibold text-brand-green">Join your venue here.</Link>
          </div>
          <div className="mt-2 text-center text-sm text-muted-foreground">
            New restaurant? <Link to="/" className="font-semibold text-brand-green">See pricing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
