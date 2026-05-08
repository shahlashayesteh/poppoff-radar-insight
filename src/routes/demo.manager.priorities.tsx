import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { Target, ChevronRight, MoreHorizontal, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/demo/manager/priorities")({
  component: Priorities,
});

const items = [
  { name: "Sancerre", category: "Wine by Glass", emoji: "🥂", flags: [{ t: "Push this week", c: "orange" }, { t: "High margin", c: "green" }] },
  { name: "Truffle Fries", category: "Side", emoji: "🍟", flags: [{ t: "Push this week", c: "orange" }, { t: "High margin", c: "green" }] },
  { name: "Seasonal Tart", category: "Dessert", emoji: "🥧", flags: [{ t: "Seasonal special", c: "blue" }, { t: "High margin", c: "green" }] },
  { name: "House Rosé", category: "Wine by Glass", emoji: "🍷", flags: [{ t: "Do not promote", c: "gray" }] },
  { name: "Sparkling Water", category: "Bottled Water", emoji: "💧", flags: [{ t: "Standard", c: "gray" }] },
];

const flagStyle = (c: string) => {
  switch (c) {
    case "orange": return { bg: "color-mix(in oklab, var(--brand-orange) 18%, white)", fg: "var(--brand-orange)" };
    case "green": return { bg: "color-mix(in oklab, var(--brand-green) 14%, white)", fg: "var(--brand-green)" };
    case "blue": return { bg: "color-mix(in oklab, oklch(0.65 0.15 240) 14%, white)", fg: "oklch(0.5 0.18 240)" };
    default: return { bg: "var(--muted)", fg: "var(--muted-foreground)" };
  }
};

function Priorities() {
  const [saved, setSaved] = useState(false);
  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        <div className="text-sm flex items-center gap-2">
          <Link to="/demo/manager" className="text-brand-green font-medium">Manager Dashboard</Link>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground font-medium">Weekly Win Priorities</span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-5xl font-extrabold tracking-tight inline-flex items-center gap-3">
              Weekly Win Priorities <span className="text-brand-orange text-3xl">⚡</span>
            </h1>
            <div className="mt-3 font-semibold">Set this week's focus in under 2 minutes.</div>
            <p className="mt-2 text-sm text-foreground/70 max-w-2xl">
              Choose the menu items your team should prioritize to upsell, recommend, and spotlight.
              These priorities will guide coaching, shift focus, and drive more profitable wins.
            </p>
          </div>
          <div className="rounded-2xl border border-border p-5 flex items-start gap-3 max-w-sm bg-white">
            <Target className="h-7 w-7 text-brand-green shrink-0" />
            <div>
              <div className="font-bold">Focus drives results</div>
              <div className="text-sm text-muted-foreground mt-1">Teams that set weekly priorities see stronger upsell performance.</div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 text-sm font-bold border-b border-border">
            <div className="col-span-5">Item</div>
            <div className="col-span-3">Category</div>
            <div className="col-span-3">Priority Flags</div>
            <div className="col-span-1"></div>
          </div>
          {items.map((it) => (
            <div key={it.name} className="grid grid-cols-12 items-center px-5 py-4 border-b border-border last:border-0">
              <div className="col-span-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl grid place-items-center text-2xl"
                  style={{ background: "color-mix(in oklab, var(--brand-orange) 8%, white)" }}>{it.emoji}</div>
                <div>
                  <div className="font-bold">{it.name}</div>
                  <div className="text-xs text-muted-foreground">{it.category}</div>
                </div>
              </div>
              <div className="col-span-3 text-sm">{it.category}</div>
              <div className="col-span-3 flex flex-wrap gap-2">
                {it.flags.map((f) => {
                  const s = flagStyle(f.c);
                  return (
                    <span key={f.t} className="text-xs font-semibold px-3 py-1 rounded-md" style={{ background: s.bg, color: s.fg }}>{f.t}</span>
                  );
                })}
              </div>
              <div className="col-span-1 text-right text-muted-foreground"><MoreHorizontal className="h-4 w-4 inline" /></div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setSaved(true)}
          className="mt-5 w-full rounded-xl py-4 text-white font-bold text-base inline-flex items-center justify-center gap-2"
          style={{ background: "var(--brand-green)" }}
        >
          <CheckCircle2 className="h-5 w-5" /> Save Weekly Priorities
        </button>
        {saved && (
          <div className="mt-3 rounded-xl px-5 py-3 inline-flex items-center gap-2 text-sm font-medium"
            style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", color: "var(--brand-green)" }}>
            <CheckCircle2 className="h-4 w-4" /> Your weekly priorities have been added to this week's coaching.
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
