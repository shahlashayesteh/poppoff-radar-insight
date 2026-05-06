import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export const Route = createFileRoute("/manager/priorities")({
  component: Priorities,
});

const flags = ["Push this week", "High margin", "Seasonal special", "Low stock", "Do not promote"];

const items = [
  { name: "Sancerre", tags: ["Push this week", "High margin"] },
  { name: "Truffle Fries", tags: ["Push this week", "High margin"] },
  { name: "Seasonal Tart", tags: ["Seasonal special"] },
  { name: "House Rosé", tags: ["Do not promote"] },
  { name: "Sparkling Water", tags: [] },
  { name: "Espresso Martini", tags: ["Push this week"] },
  { name: "Chocolate Fondant", tags: ["High margin"] },
];

function Priorities() {
  const [saved, setSaved] = useState(false);
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Weekly Menu Priorities</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">Set this week's focus in under 2 minutes.</h1>

        <div className="mt-8 rounded-2xl bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex flex-wrap gap-2">
            {flags.map((f) => (
              <span key={f} className="text-xs px-3 py-1 rounded-full bg-canvas border border-border">{f}</span>
            ))}
          </div>
          <div>
            {items.map((it, i) => (
              <div key={it.name} className={`flex items-center justify-between gap-6 px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex-1">
                  <div className="font-medium">{it.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {it.tags.length === 0 && <span className="text-xs text-muted-foreground">Standard</span>}
                    {it.tags.map((t) => (
                      <span
                        key={t}
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          t === "Do not promote"
                            ? "bg-opportunity/15 text-opportunity"
                            : t === "Seasonal special"
                            ? "bg-warning/20 text-ink"
                            : "bg-success/15 text-success"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Push</span>
                  <Switch defaultChecked={it.tags.includes("Push this week")} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={() => setSaved(true)} className="rounded-full bg-ink text-white hover:bg-ink/90 px-6">
            Save Weekly Priorities
          </Button>
          {saved && (
            <span className="text-sm text-success font-medium">
              Your weekly priorities have been added to this week's coaching.
            </span>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}
