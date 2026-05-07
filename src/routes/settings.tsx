import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const sections = [
  { title: "Restaurant profile", items: [["Restaurant name", "The Demo Restaurant"], ["Cuisine", "Modern European"], ["Cover capacity", "120"]] },
  { title: "POS system", items: [["Provider", "Lightspeed"], ["Sync frequency", "Weekly"], ["Last upload", "10 May 2026"]] },
  { title: "Menu categories", items: [["Active categories", "11"], ["Premium mains", "On"], ["Bottled water", "On"]] },
  { title: "Score thresholds", items: [["Green", "≥ 80%"], ["Amber", "55–79%"], ["Opportunity", "< 55%"]] },
];

const toggles = [
  { label: "Servers see percentages only, not money values.", on: true },
  { label: "Managers see estimated missed revenue and estimated uplift.", on: true },
  { label: "Head office sees site-level data only, not individual server names.", on: true },
  { label: "Send weekly focus push notification to servers.", on: true },
  { label: "Allow assistant manager to edit weekly priorities.", on: false },
];

function SettingsPage() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Settings</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">Workspace settings</h1>

        <div className="mt-8 grid md:grid-cols-2 gap-4">
          {sections.map((s) => (
            <div key={s.title} className="rounded-2xl bg-white border border-border p-6">
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
              <div className="mt-4 space-y-3">
                {s.items.map(([label, value]) => (
                  <div key={label}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input defaultValue={value} className="mt-1" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-6">
          <h2 className="font-display text-lg font-semibold">Visibility & permissions</h2>
          <div className="mt-4 divide-y divide-border">
            {toggles.map((t) => (
              <div key={t.label} className="flex items-center justify-between py-3">
                <span className="text-sm">{t.label}</span>
                <Switch defaultChecked={t.on} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
