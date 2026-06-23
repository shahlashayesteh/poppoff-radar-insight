import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { coachingPriorities, restaurant } from "@/lib/sample-data";
import { publicDemoRouteHandler } from "@/lib/public-demo-html";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/demo/manager/coaching")({
  server: {
    handlers: {
      GET: publicDemoRouteHandler,
      HEAD: publicDemoRouteHandler,
    },
  },
  component: Page,
});

const demoPriorities = [
  { item_name: "Sancerre (wine by glass)", priority_flag: "High priority" },
  { item_name: "Sparkling water at seating", priority_flag: "High priority" },
  { item_name: "Chocolate Fondant before bill", priority_flag: "Standard" },
  { item_name: "Truffle fries with ribeye", priority_flag: "Standard" },
];

const talkingPoints = `Team focus this week — ${restaurant.week}

1. Wine attachment is the biggest opportunity (estimated +£420 uplift).
   • Sarah and James were below their personal wine targets on dinner shifts.
   • Coach one specific pairing line: "Would you like to try our Sancerre with the salmon?"

2. Bottled water consistency at lunch is trending up (+8% this week).
   • Reinforce offering still or sparkling at every table on seating.
   • James needs a dedicated 1:1 — currently red on water.

3. Desserts are the team's strongest area (+12% vs last week).
   • Maintain the "offer dessert before the bill" habit.
   • Use Maria as a peer example in pre-shift.

4. Two servers (James, Ahmed) have not acknowledged this week's focus.
   • Send a quick nudge before the Friday dinner service.`;

function Page() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight inline-flex items-center gap-3">
          Coaching <Sparkles className="h-7 w-7 text-brand-orange" />
        </h1>
        <div className="mt-1 text-xs text-muted-foreground">{restaurant.week}</div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-5">
          <h2 className="font-display font-bold">This week's priorities</h2>
          <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
            {demoPriorities.map((p) => (
              <li key={p.item_name} className="rounded-xl border border-border px-3 py-2">
                <span className="font-semibold">{p.item_name}</span>{" "}
                <span className="text-xs text-muted-foreground">· {p.priority_flag}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-muted-foreground">
            Set or change priorities on the{" "}
            <Link to="/demo/manager/priorities" className="text-brand-green font-semibold">
              Weekly Priorities
            </Link>{" "}
            page.
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-white border border-border p-5">
          <h2 className="font-display font-bold">AI talking points</h2>
          <pre className="mt-4 whitespace-pre-wrap text-sm text-foreground/85 font-sans">{talkingPoints}</pre>
        </div>

        <div className="mt-5 grid md:grid-cols-3 gap-4">
          {coachingPriorities.map((c) => (
            <div key={c.title} className="rounded-2xl bg-white border border-border p-5">
              <div className="font-display font-bold text-sm">{c.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{c.insight}</p>
            </div>
          ))}
        </div>
      </div>
    </ManagerLayout>
  );
}
