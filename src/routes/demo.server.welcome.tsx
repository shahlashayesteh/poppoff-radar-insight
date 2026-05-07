import { createFileRoute, Link } from "@tanstack/react-router";
import { DemoServerLayout } from "@/components/demo-server-layout";
import { Sparkles, TrendingUp, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/demo/server/welcome")({
  component: SmartRecs,
});

const picks = [
  {
    name: "Espresso Martini",
    blurb: "High-margin, high signal",
    note: "+23% vs last week",
    badge: "Best",
    badgeBg: "var(--brand-green)",
    badgeFg: "white",
    emoji: "🍸",
  },
  {
    name: "Truffle Fries",
    blurb: "Perfect pairing, high upsell",
    note: "Recommend it!",
    badge: "New",
    badgeBg: "var(--brand-orange)",
    badgeFg: "white",
    emoji: "🍟",
  },
  {
    name: "Bottled Water",
    blurb: "Easy win. Add it up.",
    note: "",
    badge: "Easy",
    badgeBg: "color-mix(in oklab, var(--brand-green) 18%, white)",
    badgeFg: "var(--brand-green)",
    emoji: "💧",
  },
];

function SmartRecs() {
  return (
    <DemoServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-7 w-7 text-brand-orange shrink-0 mt-1" />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-extrabold tracking-tight leading-tight">Smart recs for you</h1>
            <p className="mt-1 text-sm text-muted-foreground">Personalised picks to boost your week</p>
          </div>
          <div className="h-12 w-12 rounded-full border border-border grid place-items-center">
            <TrendingUp className="h-5 w-5 text-brand-green" />
          </div>
        </div>

        {/* Opportunity card */}
        <div className="mt-5 rounded-3xl border border-border p-6 relative overflow-hidden"
          style={{ background: "color-mix(in oklab, var(--brand-orange) 7%, white)" }}>
          <div className="text-sm font-semibold">This week's opportunity</div>
          <div className="font-display text-6xl font-extrabold mt-2">+£230</div>
          <div className="text-lg font-semibold">potential lift</div>
          <p className="mt-3 text-sm text-foreground/80 max-w-[60%]">Focus on these high-performing menu items.</p>
          <div className="absolute right-4 top-6 text-5xl">📈</div>
        </div>

        {/* Top picks */}
        <div className="mt-6 flex items-center justify-between">
          <div className="font-semibold">Top picks for you 🔥</div>
          <span className="text-sm text-brand-green font-semibold">3 actions</span>
        </div>

        <div className="mt-3 space-y-3">
          {picks.map((p) => (
            <div key={p.name} className="rounded-2xl bg-white border border-border p-3 flex items-center gap-3">
              <div className="h-14 w-14 rounded-xl grid place-items-center text-2xl"
                style={{ background: "color-mix(in oklab, var(--brand-orange) 8%, white)" }}>{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.blurb}</div>
                {p.note && <div className="text-xs text-brand-green font-semibold mt-1">↗ {p.note}</div>}
              </div>
              <span className="text-xs font-bold rounded-lg px-3 py-1.5"
                style={{ background: p.badgeBg, color: p.badgeFg }}>{p.badge}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>

        <Link to="/demo/server" className="mt-5 block w-full rounded-2xl py-4 text-center font-display text-lg font-bold bg-brand-orange text-white">
          Let's go! 🚀
        </Link>
      </div>
    </DemoServerLayout>
  );
}
