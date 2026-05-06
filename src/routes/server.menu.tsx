import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { coachingCards, menuItems } from "@/lib/sample-data";
import { Sparkles, Check, X, MessageSquareQuote } from "lucide-react";

export const Route = createFileRoute("/server/menu")({
  component: ServerCoaching,
});

const emoji: Record<string, string> = {
  "Grilled Salmon": "🐟",
  "Ribeye Steak": "🥩",
  "Chocolate Fondant": "🍫",
  "Truffle Fries": "🍟",
  "Sancerre": "🥂",
  "Sparkling Water": "💧",
};

function ServerCoaching() {
  const [practiced, setPracticed] = useState<Record<string, boolean>>({});

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-orange">
          <Sparkles className="h-4 w-4" /> AI COACHING
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">How to win this week</h1>
        <p className="text-sm text-muted-foreground mt-1">Personal scripts based on your numbers.</p>

        {/* Coaching cards */}
        <div className="mt-5 space-y-4">
          {coachingCards.map((c) => (
            <div key={c.key} className="rounded-3xl bg-white border border-border p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-opportunity">Opportunity</div>
                  <h2 className="font-display text-xl font-extrabold mt-1 leading-tight">{c.title}</h2>
                </div>
                <button
                  onClick={() => setPracticed((p) => ({ ...p, [c.key]: !p[c.key] }))}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold border ${
                    practiced[c.key]
                      ? "bg-brand-green text-white border-brand-green"
                      : "bg-white text-foreground/70 border-border"
                  }`}
                >
                  {practiced[c.key] ? "✓ Practiced" : "Mark practiced"}
                </button>
              </div>

              <p className="mt-3 text-sm text-foreground/80">{c.why}</p>

              {/* Scripts */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground/70">
                  <MessageSquareQuote className="h-4 w-4 text-brand-orange" /> Try saying…
                </div>
                {c.scripts.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-3 text-sm"
                    style={{ background: "color-mix(in oklab, var(--brand-orange) 7%, white)", border: "1px solid color-mix(in oklab, var(--brand-orange) 22%, transparent)" }}
                  >
                    {s}
                  </div>
                ))}
              </div>

              {/* Do / Don't */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-bold text-brand-green mb-1.5">DO</div>
                  <ul className="space-y-1.5">
                    {c.dos.map((d, i) => (
                      <li key={i} className="flex gap-1.5 text-xs">
                        <Check className="h-3.5 w-3.5 text-brand-green shrink-0 mt-0.5" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-opportunity mb-1.5">DON'T</div>
                  <ul className="space-y-1.5">
                    {c.donts.map((d, i) => (
                      <li key={i} className="flex gap-1.5 text-xs">
                        <X className="h-3.5 w-3.5 text-opportunity shrink-0 mt-0.5" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pairings */}
        <h2 className="mt-7 font-display text-2xl font-extrabold tracking-tight">Menu pairings</h2>
        <p className="text-sm text-muted-foreground mt-1">What to suggest with each dish.</p>
        <div className="mt-3 space-y-3 mb-2">
          {menuItems.map((m) => (
            <div key={m.name} className="rounded-2xl bg-white border border-border p-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-xl grid place-items-center text-2xl"
                  style={{ background: "color-mix(in oklab, var(--brand-orange) 8%, white)" }}
                >
                  {emoji[m.name] ?? "🍽️"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Pair with <span className="font-semibold text-foreground">{m.pairing}</span>
                  </div>
                </div>
                {m.priority === "High Priority" && (
                  <span className="text-[10px] font-bold rounded-md px-2 py-1 bg-brand-orange/15 text-brand-orange">PUSH</span>
                )}
              </div>
              <div className="mt-3 rounded-xl p-3 text-xs"
                style={{ background: "color-mix(in oklab, var(--brand-green) 8%, white)" }}>
                <div className="font-bold text-brand-green mb-0.5">Say it like this:</div>
                <div className="text-foreground/85">"{m.pairingPitch}"</div>
                <div className="mt-1.5 text-brand-green font-semibold">↗ {m.attachLift}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ServerLayout>
  );
}
