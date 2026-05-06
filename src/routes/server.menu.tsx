import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { menuItems } from "@/lib/sample-data";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/server/menu")({
  component: ServerMenu,
});

function ServerMenu() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-2xl font-semibold">Menu</h1>
        <p className="text-sm text-muted-foreground mt-1">This week's pairings and priorities.</p>

        <div className="mt-5 rounded-2xl gradient-hero text-white p-5">
          <Sparkles className="h-4 w-4 text-success" />
          <p className="mt-3 text-sm">
            <span className="text-success font-medium">After the salmon, try:</span> "Would you like to try our Sancerre?
            It is one of our most popular pairings."
          </p>
        </div>

        <div className="mt-5 space-y-3 pb-4">
          {menuItems.map((m) => (
            <div key={m.name} className="rounded-2xl bg-white border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.category} · Pair with {m.pairing}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success font-medium">
                  {m.priority === "High Priority" ? "Push" : "Standard"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ServerLayout>
  );
}
