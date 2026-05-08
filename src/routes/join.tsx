import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/join")({
  component: Join,
  head: () => ({ meta: [{ title: "Join your venue — PoppOff" }] }),
});

function Join() {
  const [companyName, setCompanyName] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (!/^\d{6}$/.test(code.trim())) { toast.error("Access code must be 6 digits"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName, business_name: companyName } },
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
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2) { toast.error(e2.message); setLoading(false); return; }
    }
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("profiles").upsert({ id: u.user.id, full_name: fullName, business_name: companyName });
    }
    const { data: vid, error: joinErr } = await supabase.rpc("join_venue_with_code", { _code: code.trim() });
    if (joinErr) {
      toast.error(joinErr.message.includes("Invalid") ? "Invalid access code. Check with your manager." : joinErr.message);
      setLoading(false);
      return;
    }
    if (u.user && vid) {
      await supabase.from("server_targets").insert({ venue_id: vid as unknown as string, user_id: u.user.id }).then(() => {}, () => {});
      await supabase.from("server_streaks" as never).insert({ venue_id: vid as unknown as string, user_id: u.user.id, current_streak: 0, longest_streak: 0 } as never).then(() => {}, () => {});
    }
    toast.success("You're in! Welcome to your team.");
    navigate({ to: "/server" });
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to="/signin" className="text-sm text-muted-foreground">Sign in</Link>
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl bg-white border border-border p-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Server sign up</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use the 6-digit access code from your manager's dashboard.</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" placeholder="Company / venue name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-center text-2xl font-mono tracking-widest" placeholder="Access code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border border-border px-4 py-3 text-sm" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <button disabled={loading} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--brand-green)" }}>
              {loading ? "Joining…" : "Join my team"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
