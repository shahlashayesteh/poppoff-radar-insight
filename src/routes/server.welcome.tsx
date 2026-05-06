import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/server/welcome")({
  component: Welcome,
});

const reasons = [
  "Better upselling shows confidence and product knowledge.",
  "Strong sales performance can help you stand out to managers.",
  "Consistent improvement can support promotion opportunities.",
  "Understanding revenue makes you more commercially aware.",
  "Commercial awareness is a key skill for supervisors and managers.",
  "Better recommendations can improve the guest experience.",
  "Small improvements each week can build into strong long-term performance.",
];

function Welcome() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="gradient-hero text-white px-6 pt-14 pb-20">
        <div className="mx-auto max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
            <Sparkles className="h-3 w-3" /> Welcome to Popp Off
          </div>
          <h1 className="mt-5 font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            Your performance matters.
          </h1>
          <p className="mt-5 text-white/80 leading-relaxed">
            Great service is not only about taking orders. It is about understanding the guest, recognising opportunities,
            and helping the restaurant perform better while giving guests a better experience.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 -mt-12 pb-12">
        <div className="rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
          <p className="text-foreground leading-relaxed">
            This scorecard is designed to help you see where you are already strong and where you can improve. It is not
            here to criticise you. It is here to help you build the skills that make strong servers stand out.
          </p>
          <p className="mt-4 text-foreground leading-relaxed">
            Improving your sales performance can help you become more confident with guests, better at recommending
            products, more valuable to your team, and more prepared for future progression into senior server, supervisor,
            assistant manager, or management roles.
          </p>
          <p className="mt-4 text-foreground leading-relaxed">
            Each week, you will see simple feedback across key categories such as wine, bottled water, cocktails, desserts,
            sides, and specials.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { c: "var(--success)", t: "Green", d: "Performing strongly or improving." },
              { c: "var(--warning)", t: "Amber", d: "Room to strengthen consistency." },
              { c: "var(--opportunity)", t: "Red", d: "Clear opportunity to focus on next week." },
            ].map((s) => (
              <div key={s.t} className="rounded-xl border border-border p-3">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.c }} />
                <div className="font-semibold mt-2 text-sm">{s.t}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.d}</div>
              </div>
            ))}
          </div>

          <p className="mt-6 font-medium text-ink">The goal is simple: improve one area at a time.</p>
        </div>

        <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">Why this matters for you</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {reasons.map((r) => (
            <div key={r} className="rounded-xl bg-white border border-border p-4 text-sm">
              {r}
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild size="lg" className="rounded-full bg-ink text-white hover:bg-ink/90 px-8">
            <Link to="/server">View My Scorecard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
