import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { menuItems } from "@/lib/sample-data";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/server/menu")({
  component: ServerMenu,
});

const emoji: Record<string, string> = {
  "Grilled Salmon": "🐟",
  "Ribeye Steak": "🥩",
  "Chocolate Fondant": "🍫",
  "Truffle Fries": "🍟",
  "Sancerre": "🥂",
  "Sparkling Water": "💧",
};

function ServerMenu() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Coaching</h1>
        <p className="text-sm text-muted-foreground mt-1">This week's pairings and priorities.</p>

        <div className="mt-5 rounded-2xl p-5"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", border: "1px solid color-mix(in oklab, var(--brand-green) 30%, transparent)" }}>
          <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-green">
            <Sparkles className="h-4 w-4" /> AI tip
          </div>
          <p className="mt-2 text-sm text-foreground">
            <span className="font-semibold">After the salmon, try:</span> "Would you like to try our Sancerre? It's one of our most popular pairings."
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {menuItems.map((m) => (
            <div key={m.name} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl grid place-items-center text-2xl"
                style={{ background: "color-mix(in oklab, var(--brand-orange) 8%, white)" }}>{emoji[m.name] ?? "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.category} · Pair with {m.pairing}</div>
              </div>
              <span className="text-xs font-bold rounded-md px-2 py-1"
                style={{
                  background: m.priority === "High Priority"
                    ? "color-mix(in oklab, var(--brand-orange) 18%, white)"
                    : "var(--muted)",
                  color: m.priority === "High Priority" ? "var(--brand-orange)" : "var(--muted-foreground)",
                }}>
                {m.priority === "High Priority" ? "Push" : "Standard"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ServerLayout>
  );
}
