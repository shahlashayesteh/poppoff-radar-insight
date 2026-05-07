import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/join")({
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!/^\d{6}$/.test(code)) throw new Error("Join code must be 6 digits");

      if (mode === "signup") {
        const { error: signErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/server",
            data: { full_name: fullName },
          },
        });
        if (signErr) throw signErr;
      } else {
        const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signErr) throw signErr;
      }

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setError("Check your email to verify your account, then sign in and enter your join code.");
        return;
      }

      const { error: rpcErr } = await supabase.rpc("join_venue_with_code", { _code: code });
      if (rpcErr) throw rpcErr;

      navigate({ to: "/server" });
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
            Join your team
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter the 6-digit code your manager shared with you.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6-digit join code"
              className="w-full rounded-xl border-2 border-border px-4 py-4 text-center text-2xl font-display font-extrabold tracking-[0.4em]"
            />
            {mode === "signup" && (
              <input
                required value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm"
              />
            )}
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm"
            />
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Create a password (min 6)" : "Password"}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit" disabled={busy}
              className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand-orange)" }}
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create account & join" : "Sign in & join"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signup" ? (
              <>Already have an account?{" "}
                <button className="font-semibold text-foreground underline" onClick={() => setMode("signin")}>Sign in</button>
              </>
            ) : (
              <>New here?{" "}
                <button className="font-semibold text-foreground underline" onClick={() => setMode("signup")}>Create an account</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
