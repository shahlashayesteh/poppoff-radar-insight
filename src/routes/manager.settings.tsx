// Phase 12 — Manager settings reorganised into named sections, including
// Billing & subscription and Audit-log link. Server-visibility toggles are
// limited to safe presentation switches; manager-only intelligence
// (LLS, labour cost, identity quality, Shift Match) is never exposed via
// these toggles.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getActiveManagerVenue } from "@/lib/active-venue";
import { useRoleGate } from "@/lib/auth-gate";
import { useEntitlement, statusLabel } from "@/lib/entitlements";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/settings")({ component: SettingsPage });

const SECTIONS = [
  { id: "venue", label: "Venue profile" },
  { id: "data-sources", label: "Data sources" },
  { id: "import-rules", label: "Import rules" },
  { id: "roles", label: "Roles & permissions" },
  { id: "visibility", label: "Server visibility" },
  { id: "lls", label: "LLS thresholds" },
  { id: "billing", label: "Billing & subscription" },
  { id: "audit", label: "Audit logs" },
] as const;

// Server-visibility toggles that are SAFE to expose. Each toggle only
// controls a presentation switch on already server-safe data (rank,
// streaks, peer percentages). None of these unlock LLS, labour cost,
// identity quality, or Shift Match for servers.
type ServerVisibilityToggle = {
  key:
    | "servers_see_percentages_only"
    | "send_weekly_push_notifications";
  label: string;
  help: string;
};

const SERVER_VISIBILITY_TOGGLES: ServerVisibilityToggle[] = [
  {
    key: "servers_see_percentages_only",
    label: "Servers see percentages only, not money values",
    help: "Hides absolute revenue numbers from server pages. Manager LLS, labour cost and import quality stay hidden regardless of this toggle.",
  },
  {
    key: "send_weekly_push_notifications",
    label: "Send weekly focus push notification to servers",
    help: "Sends the manager-approved priority each week. Never includes margin, labour cost, or identity quality.",
  },
];

function SettingsPage() {
  useRoleGate("manager");
  const entitlement = useEntitlement();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [coverCapacity, setCoverCapacity] = useState<number | "">("");
  const [posSystem, setPosSystem] = useState("");
  const [laborSystem, setLaborSystem] = useState("");
  const [market, setMarket] = useState("");
  const [currency, setCurrency] = useState("");
  const [llsGreen, setLlsGreen] = useState<number>(13.0);
  const [llsAmber, setLlsAmber] = useState<number>(10.0);
  const [toggles, setToggles] = useState({
    servers_see_percentages_only: true,
    managers_see_estimated_uplift: true,
    head_office_aggregated_only: true,
    send_weekly_push_notifications: true,
    allow_assistant_manager_priorities: false,
  });

  useEffect(() => {
    (async () => {
      const v = await getActiveManagerVenue();
      if (!v) return;
      setVenueId(v.id);
      setVenueName(v.name);
      const { data: vset } = await supabase
        .from("venue_settings")
        .select("*")
        .eq("venue_id", v.id)
        .maybeSingle();
      if (vset) {
        const any = vset as any;
        setCuisine(any.cuisine || "");
        setCoverCapacity(any.cover_capacity ?? "");
        setPosSystem(any.pos_system || "");
        setLaborSystem(any.labor_system || "");
        setMarket(any.market || "");
        setCurrency(any.currency || "");
        if (any.lls_green_threshold != null) setLlsGreen(Number(any.lls_green_threshold));
        if (any.lls_amber_threshold != null) setLlsAmber(Number(any.lls_amber_threshold));
        setToggles({
          servers_see_percentages_only: any.servers_see_percentages_only,
          managers_see_estimated_uplift: any.managers_see_estimated_uplift,
          head_office_aggregated_only: any.head_office_aggregated_only,
          send_weekly_push_notifications: any.send_weekly_push_notifications,
          allow_assistant_manager_priorities: any.allow_assistant_manager_priorities,
        });
      }
    })();
  }, []);

  const save = async () => {
    if (!venueId) return;
    await supabase.from("venues").update({ name: venueName }).eq("id", venueId);
    const { error } = await supabase.from("venue_settings").upsert(
      {
        venue_id: venueId,
        cuisine: cuisine || null,
        cover_capacity: coverCapacity === "" ? null : Number(coverCapacity),
        pos_system: posSystem || null,
        labor_system: laborSystem || null,
        market: market || null,
        currency: currency || null,
        lls_green_threshold: llsGreen,
        lls_amber_threshold: llsAmber,
        ...toggles,
      } as any,
      { onConflict: "venue_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
  };

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Settings</div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">
          Manager control centre
        </h1>

        {/* Section nav */}
        <nav aria-label="Settings sections" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Venue profile */}
        <section id="venue" className="mt-8 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Venue profile</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Active venue ID</Label>
              <Input value={venueId ?? ""} readOnly className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Restaurant name</Label>
              <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cuisine</Label>
              <Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cover capacity</Label>
              <Input
                type="number"
                value={coverCapacity}
                onChange={(e) => setCoverCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Market / region</Label>
              <Input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. UK, US-NY" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="GBP, USD, EUR" className="mt-1" />
            </div>
          </div>
        </section>

        {/* Data sources */}
        <section id="data-sources" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Data sources</h2>
          <p className="text-xs text-muted-foreground">
            Identifies which POS and rota systems feed staging imports. Used for source-system attribution on every batch.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">POS system</Label>
              <Input value={posSystem} onChange={(e) => setPosSystem(e.target.value)} placeholder="Toast, Square, Lightspeed…" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Labour / rota system</Label>
              <Input value={laborSystem} onChange={(e) => setLaborSystem(e.target.value)} placeholder="Deputy, Harri, RotaCloud…" className="mt-1" />
            </div>
          </div>
        </section>

        {/* Import rules */}
        <section id="import-rules" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Import rules</h2>
          <p className="text-xs text-muted-foreground">
            Staging, validation, identity matching and reconciliation rules are managed in the
            {" "}<Link to="/manager/imports" className="underline">Imports workspace</Link>. Cancelled or expired subscriptions cannot commit production import batches.
          </p>
        </section>

        {/* Roles & permissions */}
        <section id="roles" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Roles & permissions</h2>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm">Allow assistant managers to edit weekly priorities</span>
              <Switch
                checked={toggles.allow_assistant_manager_priorities}
                onCheckedChange={(v) => setToggles({ ...toggles, allow_assistant_manager_priorities: v })}
              />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm">Head office sees site-level data only (aggregated)</span>
              <Switch
                checked={toggles.head_office_aggregated_only}
                onCheckedChange={(v) => setToggles({ ...toggles, head_office_aggregated_only: v })}
              />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm">Managers see estimated/modelled uplift figures</span>
              <Switch
                checked={toggles.managers_see_estimated_uplift}
                onCheckedChange={(v) => setToggles({ ...toggles, managers_see_estimated_uplift: v })}
              />
            </div>
          </div>
        </section>

        {/* Server visibility */}
        <section id="visibility" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Server visibility</h2>
          <p className="text-xs text-muted-foreground">
            These toggles only adjust presentation of server-safe game data. They cannot expose manager-only
            intelligence such as labour cost, LLS, import quality, identity quality, or Shift Match — those
            remain hidden from servers regardless of any toggle here.
          </p>
          <div className="divide-y divide-border">
            {SERVER_VISIBILITY_TOGGLES.map(({ key, label, help }) => (
              <div key={key} className="flex items-start justify-between py-3 gap-4">
                <div>
                  <div className="text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{help}</div>
                </div>
                <Switch
                  checked={toggles[key]}
                  onCheckedChange={(v) => setToggles({ ...toggles, [key]: v })}
                />
              </div>
            ))}
          </div>
        </section>

        {/* LLS thresholds */}
        <section id="lls" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Labor Leverage thresholds</h2>
          <p className="text-xs text-muted-foreground">
            Used by the Labor Leverage scorecard to colour-band each shift's LLS. Manager-only.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Green ≥</Label>
              <Input type="number" step="0.1" value={llsGreen} onChange={(e) => setLlsGreen(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Amber ≥</Label>
              <Input type="number" step="0.1" value={llsAmber} onChange={(e) => setLlsAmber(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
        </section>

        {/* Billing & subscription */}
        <section id="billing" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Billing & subscription</h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Status</div>
              <div className="mt-1 font-semibold" data-testid="billing-status">
                {entitlement.loading ? "Loading…" : statusLabel(entitlement.status)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Plan</div>
              <div className="mt-1 font-mono text-xs">{entitlement.planId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Next billing date</div>
              <div className="mt-1">
                {entitlement.currentPeriodEnd
                  ? new Date(entitlement.currentPeriodEnd).toLocaleDateString()
                  : "—"}
              </div>
            </div>
          </div>
          {entitlement.showPastDueWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Your last payment failed and your account is past due. Stripe is retrying automatically.
              Update billing to avoid losing import access.
            </div>
          )}
          {!entitlement.canImport && !entitlement.loading && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900">
              Production data imports are disabled for this subscription status. Re-activate billing to resume importing.
            </div>
          )}
        </section>

        {/* Audit logs */}
        <section id="audit" className="mt-6 rounded-2xl bg-white border border-border p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Audit logs</h2>
          <p className="text-xs text-muted-foreground">
            Import approvals, identity decisions, menu intelligence transitions and billing events are
            recorded in dedicated audit tables. Detailed audit views are available from each workspace —
            see{" "}
            <Link to="/manager/imports" className="underline">Imports</Link>
            ,{" "}
            <Link to="/manager/menu" className="underline">Menu</Link>
            {" "}and{" "}
            <Link to="/manager/priorities" className="underline">Priorities</Link>.
          </p>
        </section>

        <button
          onClick={save}
          className="mt-6 rounded-xl px-6 py-3 text-sm font-bold text-white"
          style={{ background: "var(--brand-green)" }}
        >
          Save settings
        </button>
      </div>
    </ManagerLayout>
  );
}
