import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [coverCapacity, setCoverCapacity] = useState<number | "">("");
  const [green, setGreen] = useState(80);
  const [amber, setAmber] = useState(55);
  const [llsGreen, setLlsGreen] = useState<number>(13.0);
  const [llsAmber, setLlsAmber] = useState<number>(10.0);
  const [toggles, setToggles] = useState({
    servers_see_percentages_only: true,
    managers_see_estimated_uplift: true,
    head_office_aggregated_only: true,
    send_weekly_push_notifications: true,
    allow_assistant_manager_priorities: false,
    premium_mains_on: true,
    bottled_water_on: true,
  });

  useEffect(() => {
    (async () => {
      const v = await getManagerVenue();
      if (!v) return;
      setVenueId(v.id); setVenueName(v.name);
      const { data: vset } = await supabase.from("venue_settings").select("*").eq("venue_id", v.id).maybeSingle();
      if (vset) {
        setCuisine(vset.cuisine || "");
        setCoverCapacity(vset.cover_capacity ?? "");
        setGreen(Number(vset.green_threshold));
        setAmber(Number(vset.amber_threshold));
        const anyVset = vset as any;
        if (anyVset.lls_green_threshold != null) setLlsGreen(Number(anyVset.lls_green_threshold));
        if (anyVset.lls_amber_threshold != null) setLlsAmber(Number(anyVset.lls_amber_threshold));
        setToggles({
          servers_see_percentages_only: vset.servers_see_percentages_only,
          managers_see_estimated_uplift: vset.managers_see_estimated_uplift,
          head_office_aggregated_only: vset.head_office_aggregated_only,
          send_weekly_push_notifications: vset.send_weekly_push_notifications,
          allow_assistant_manager_priorities: vset.allow_assistant_manager_priorities,
          premium_mains_on: vset.premium_mains_on,
          bottled_water_on: vset.bottled_water_on,
        });
      }
    })();
  }, []);

  const save = async () => {
    if (!venueId) return;
    await supabase.from("venues").update({ name: venueName }).eq("id", venueId);
    const { error } = await supabase.from("venue_settings").upsert({
      venue_id: venueId, cuisine: cuisine || null, cover_capacity: coverCapacity === "" ? null : Number(coverCapacity),
      green_threshold: green, amber_threshold: amber, ...toggles,
    }, { onConflict: "venue_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
  };

  const toggleLabels: [keyof typeof toggles, string][] = [
    ["servers_see_percentages_only", "Servers see percentages only, not money values."],
    ["managers_see_estimated_uplift", "Managers see estimated uplift values."],
    ["head_office_aggregated_only", "Head office sees site-level data only."],
    ["send_weekly_push_notifications", "Send weekly focus push notification to servers."],
    ["allow_assistant_manager_priorities", "Allow assistant manager to edit weekly priorities."],
    ["premium_mains_on", "Track premium mains category."],
    ["bottled_water_on", "Track bottled water category."],
  ];

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Settings</div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">Workspace settings</h1>

        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-border p-6 space-y-3">
            <h2 className="font-display text-lg font-bold">Venue profile</h2>
            <div><Label className="text-xs text-muted-foreground">Restaurant name</Label><Input value={venueName} onChange={(e) => setVenueName(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Cuisine</Label><Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Cover capacity</Label><Input type="number" value={coverCapacity} onChange={(e) => setCoverCapacity(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1" /></div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-6 space-y-3">
            <h2 className="font-display text-lg font-bold">Score thresholds</h2>
            <p className="text-xs text-muted-foreground">AI-managed — targets are set automatically from venue average and each server's history.</p>
            <div><Label className="text-xs text-muted-foreground">Green ≥ (%)</Label><Input type="number" value={green} disabled className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Amber ≥ (%)</Label><Input type="number" value={amber} disabled className="mt-1" /></div>
            <p className="text-xs text-muted-foreground">Below amber is treated as an opportunity (red).</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-6">
          <h2 className="font-display text-lg font-bold">Visibility & permissions</h2>
          <div className="mt-4 divide-y divide-border">
            {toggleLabels.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-3">
                <span className="text-sm">{label}</span>
                <Switch checked={toggles[key]} onCheckedChange={(v) => setToggles({ ...toggles, [key]: v })} />
              </div>
            ))}
          </div>
        </div>

        <button onClick={save} className="mt-6 rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: "var(--brand-green)" }}>Save settings</button>
      </div>
    </ManagerLayout>
  );
}
