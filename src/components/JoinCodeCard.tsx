import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Venue = { id: string; name: string; join_code: string };

export function JoinCodeCard() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("venues")
      .select("id, name, join_code")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    setVenue(data ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copy = async () => {
    if (!venue) return;
    await navigator.clipboard.writeText(venue.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = async () => {
    if (!venue) return;
    setRegenerating(true);
    const { data, error } = await supabase.rpc("regenerate_venue_join_code", { _venue_id: venue.id });
    setRegenerating(false);
    setConfirmRegen(false);
    if (!error && typeof data === "string") {
      setVenue({ ...venue, join_code: data });
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-border p-5">
        <div className="text-sm text-muted-foreground">Loading join code…</div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="rounded-2xl bg-white border border-border p-5">
        <div className="text-sm text-muted-foreground">No venue yet. Complete checkout to set one up.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-brand-orange bg-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest font-bold text-brand-green">Server Join Code</div>
          <h3 className="font-display font-bold mt-1">{venue.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Share this code with your servers. They sign up at <span className="font-semibold text-foreground">/join</span>.
          </p>
        </div>
        <button
          onClick={() => setConfirmRegen(true)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          title="Generate a new code"
        >
          <RefreshCw className="h-3.5 w-3.5" /> New code
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <div
          className="font-display font-extrabold text-4xl tracking-[0.3em] px-5 py-3 rounded-xl"
          style={{ background: "color-mix(in oklab, var(--brand-orange) 12%, white)", color: "var(--brand-orange)" }}
        >
          {venue.join_code}
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white"
          style={{ background: "var(--brand-orange)" }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>

      {confirmRegen && (
        <div className="mt-4 rounded-xl border border-border p-3 text-xs">
          <div className="font-semibold">Generate a new code?</div>
          <div className="text-muted-foreground mt-1">
            The old code will stop working immediately. Servers already on the team stay on the team.
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={regenerate}
              disabled={regenerating}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand-orange)" }}
            >
              {regenerating ? "Generating…" : "Yes, generate new code"}
            </button>
            <button
              onClick={() => setConfirmRegen(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
