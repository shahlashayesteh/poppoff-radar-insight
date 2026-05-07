import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/logo";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const PLAN_LABEL: Record<string, string> = {
  poppoff_starter_monthly: "Starter",
  poppoff_pro_monthly: "Pro",
  poppoff_enterprise_monthly: "Enterprise",
};

function SettingsPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sub, setSub] = useState<{ price_id: string; status: string; current_period_end: string | null } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("profiles").select("full_name,business_name").eq("id", user.id).maybeSingle(),
        supabase.from("subscriptions").select("price_id,status,current_period_end").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setFullName((p as any)?.full_name ?? "");
      setBusinessName((p as any)?.business_name ?? "");
      setSub(s as any);
    })();
  }, [user, loading, navigate]);

  async function save() {
    if (!user) return;
    setSaving(true); setSaved(false);
    await supabase.from("profiles").update({ full_name: fullName, business_name: businessName }).eq("id", user.id);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-white">
      <header className="px-6 py-4 border-b border-border">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <Link to={role === "server" ? "/server" : "/manager"} className="text-sm text-muted-foreground">← Back</Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Settings</h1>

        <section className="mt-8 rounded-2xl bg-white border border-border p-6">
          <h2 className="font-display text-lg font-bold">Your profile</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-semibold">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm" />
            </div>
            {role === "manager" && (
              <div>
                <label className="text-sm font-semibold">Business name</label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border px-4 py-3 text-sm" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "var(--brand-orange)" }}>
                {saving ? "Saving…" : "Save"}
              </button>
              {saved && <span className="text-sm text-brand-green font-semibold">Saved</span>}
            </div>
          </div>
        </section>

        {role === "manager" && (
          <section className="mt-6 rounded-2xl bg-white border border-border p-6">
            <h2 className="font-display text-lg font-bold">Subscription</h2>
            {!sub ? (
              <p className="mt-3 text-sm text-muted-foreground">No subscription on file.</p>
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-semibold">{PLAN_LABEL[sub.price_id] ?? sub.price_id}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold capitalize">{sub.status}</dd>
                <dt className="text-muted-foreground">Renews</dt>
                <dd className="font-semibold">{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</dd>
              </dl>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white border border-border p-6">
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground px-4 py-2 text-sm font-bold">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </section>
      </div>
    </div>
  );
}
