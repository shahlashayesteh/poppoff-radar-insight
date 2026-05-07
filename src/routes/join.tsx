import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/join")({
  component: Join,
});

function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("Join code must be 6 digits.");
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    let userId = signUpData?.user?.id ?? null;

    if (signUpErr) {
      if (signUpErr.message?.toLowerCase().includes("registered") || signUpErr.message?.toLowerCase().includes("already")) {
        setError("An account with this email already exists. Please log in instead.");
        setLoading(false);
        return;
      }
      setError(signUpErr.message);
      setLoading(false);
      return;
    }

    // Ensure we have a session (auto-confirm is on)
    if (!userId) {
      const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
      userId = signInData?.user?.id ?? null;
    }
    if (!userId) {
      setError("Could not create account. Please try again.");
      setLoading(false);
      return;
    }

    const { error: rpcErr } = await supabase.rpc("join_venue_with_code", { _code: cleanCode });
    if (rpcErr) {
      setError(rpcErr.message?.includes("Invalid join code") ? "Invalid join code. Please check with your manager." : rpcErr.message);
      setLoading(false);
      return;
    }
    navigate({ to: "/server" });
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-4 border-b border-border">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/login" className="text-sm text-muted-foreground">Have an account? Sign in</Link>
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Join your venue</h1>
          <p className="mt-2 text-sm text-muted-foreground">Get the 6-digit code from your manager.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-semibold">Join code</label>
              <input
                inputMode="numeric" pattern="\d{6}" maxLength={6} required
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm tracking-[0.4em] text-center font-mono"
                placeholder="• • • • • •"
              />
            </div>
            <Field label="Your name" value={fullName} onChange={setFullName} />
            <Field label="Email" type="email" value={email} onChange={setEmail} />
            <Field label="Password" type="password" value={password} onChange={setPassword} minLength={8} />
            {error && <div className="text-sm text-opportunity">{error}</div>}
            <button
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand-green)" }}
            >
              {loading ? "Joining…" : "Join venue"}
            </button>
          </form>
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
        type={type} value={value} required minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm"
      />
    </div>
  );
}
