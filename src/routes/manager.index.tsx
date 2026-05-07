import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Copy, RefreshCw, Users, Check } from "lucide-react";

export const Route = createFileRoute("/manager/")({
  component: ManagerDashboard,
});

type Venue = { id: string; name: string; join_code: string };
type Member = { user_id: string; full_name: string | null };

function ManagerDashboard() {
  const { user } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const { data: v } = await supabase
      .from("venues")
      .select("id,name,join_code")
      .eq("manager_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!v) { setVenue(null); setMembers([]); return; }
    setVenue(v as Venue);

    const { data: vm } = await supabase
      .from("venue_members")
      .select("user_id, profiles(full_name)")
      .eq("venue_id", (v as Venue).id);
    setMembers(((vm ?? []) as any[]).map((r) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name ?? null,
    })));
  }

  useEffect(() => { load(); }, [user]);

  async function copyCode() {
    if (!venue) return;
    await navigator.clipboard.writeText(venue.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    if (!venue) return;
    if (!confirm("Generate a new join code? The old code will stop working immediately.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("regenerate_venue_join_code", { _venue_id: venue.id });
    setBusy(false);
    if (!error && data) setVenue({ ...venue, join_code: data as string });
  }

  return (
    <ManagerLayout>
      <div className="px-8 py-7 max-w-5xl">
        {!venue ? (
          <div className="rounded-2xl bg-white border border-border p-8 text-center">
            <h1 className="font-display text-2xl font-extrabold">No venue yet.</h1>
            <p className="mt-2 text-sm text-muted-foreground">Complete checkout to set one up.</p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold tracking-tight">{venue.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Manage your team and grow your wins.</p>

            {/* Join code card */}
            <div className="mt-8 rounded-2xl border-2 border-brand-orange p-6 bg-white">
              <div className="text-xs uppercase tracking-widest text-brand-orange font-bold">Venue join code</div>
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <div className="font-display text-5xl font-extrabold tracking-[0.25em] font-mono">{venue.join_code}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyCode}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold border-2 border-foreground"
                  >
                    {copied ? <Check className="h-4 w-4 text-brand-green" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={regenerate}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: "var(--brand-orange)" }}
                  >
                    <RefreshCw className="h-4 w-4" /> Regenerate
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Share this code with your team. They enter it at <span className="font-mono">/join</span> to sign up.
              </p>
            </div>

            {/* Server list */}
            <div className="mt-6 rounded-2xl bg-white border border-border">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Users className="h-4 w-4" />
                <h2 className="font-display text-lg font-bold">Your team</h2>
                <span className="text-xs text-muted-foreground ml-auto">{members.length} {members.length === 1 ? "server" : "servers"}</span>
              </div>
              {members.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No servers yet. Share your join code with your team via WhatsApp or however you like.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {members.map((m) => (
                    <li key={m.user_id} className="px-5 py-3 text-sm font-medium">
                      {m.full_name ?? "Server"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </ManagerLayout>
  );
}
