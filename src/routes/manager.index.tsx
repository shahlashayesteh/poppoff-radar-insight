import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { StatusDot, StatusBadge } from "@/components/status";
import { servers, managerKpis, coachingPriorities, restaurant } from "@/lib/sample-data";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Users, TrendingUp, Wine, Cake, Droplet, Eye, AlertTriangle, PoundSterling } from "lucide-react";

export const Route = createFileRoute("/manager/")({
  component: ManagerDashboard,
});

const kpiCards = [
  { label: "Total Covers", value: managerKpis.totalCovers, icon: Users },
  { label: "Avg Spend Per Cover", value: `£${managerKpis.avgSpc.toFixed(2)}`, icon: PoundSterling },
  { label: "Wine Opportunity", value: managerKpis.wineOpportunity, icon: Wine, accent: "warning" },
  { label: "Dessert Performance", value: managerKpis.dessertPerformance, icon: Cake, accent: "success" },
  { label: "Bottled Water Progress", value: managerKpis.waterProgress, icon: Droplet, accent: "success" },
  { label: "Stats Viewed", value: managerKpis.viewed, icon: Eye },
  { label: "Estimated Uplift", value: `£${managerKpis.uplift}`, icon: TrendingUp, accent: "success" },
  { label: "Red Opportunities", value: managerKpis.redOpportunities, icon: AlertTriangle, accent: "opportunity" },
];

function ManagerDashboard() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Manager dashboard · {restaurant.week}</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">{restaurant.name}</h1>
          </div>
          <Button asChild className="rounded-full bg-ink text-white hover:bg-ink/90">
            <Link to="/manager/priorities">Set weekly priorities</Link>
          </Button>
        </div>

        {/* KPIs */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((c) => (
            <div key={c.label} className="rounded-2xl bg-white border border-border p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3 font-display text-3xl font-semibold" style={{ color: c.accent ? `var(--${c.accent})` : undefined }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Team table */}
        <div className="mt-10 rounded-2xl bg-white border border-border overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-border">
            <h2 className="font-display text-lg font-semibold">Team scorecard</h2>
            <Link to="/manager/team" className="text-sm text-muted-foreground hover:text-ink inline-flex items-center gap-1">
              Team trends <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3">Server</th>
                  <th className="px-3 py-3">Overall</th>
                  <th className="px-3 py-3">Wine</th>
                  <th className="px-3 py-3">Water</th>
                  <th className="px-3 py-3">Cocktails</th>
                  <th className="px-3 py-3">Desserts</th>
                  <th className="px-3 py-3">Sides</th>
                  <th className="px-3 py-3">SPC</th>
                  <th className="text-left px-3 py-3">Weekly Focus</th>
                  <th className="px-3 py-3">Viewed</th>
                  <th className="px-3 py-3">Acknowledged</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-canvas/60">
                    <td className="px-5 py-4 font-medium">{s.name}</td>
                    <td className="px-3 text-center"><StatusDot status={s.overall} className="h-3 w-3 inline-block" /></td>
                    <td className="px-3 text-center"><StatusDot status={s.wine} /></td>
                    <td className="px-3 text-center"><StatusDot status={s.water} /></td>
                    <td className="px-3 text-center"><StatusDot status={s.cocktails} /></td>
                    <td className="px-3 text-center"><StatusDot status={s.desserts} /></td>
                    <td className="px-3 text-center"><StatusDot status={s.sides} /></td>
                    <td className="px-3 text-center"><StatusDot status={s.spc} /></td>
                    <td className="px-3 py-4 text-muted-foreground">{s.weeklyFocus}</td>
                    <td className="px-3 text-center text-xs">{s.viewed ? "Yes" : "—"}</td>
                    <td className="px-3 text-center text-xs">{s.acknowledged ? "Yes" : "—"}</td>
                    <td className="px-3">
                      <Link to="/manager/server/$id" params={{ id: s.id }} className="text-xs text-muted-foreground hover:text-ink">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coaching priorities */}
        <div className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">This Week's Coaching Priorities</div>
              <h2 className="font-display text-2xl font-semibold mt-1">Where to focus the team</h2>
            </div>
          </div>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            {coachingPriorities.map((p, i) => (
              <div key={p.title} className="rounded-2xl bg-ink text-white p-6">
                <div className="text-success font-display text-2xl font-semibold">0{i + 1}</div>
                <div className="mt-3 font-medium">{p.title}</div>
                <p className="mt-3 text-sm text-white/70">{p.insight}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-2xl bg-white border border-border p-6">
          <StatusBadge status="amber">Manager insight</StatusBadge>
          <p className="mt-3 text-foreground max-w-3xl">
            This week's coaching priority is wine attachment during dinner shifts. Three servers were below their personal
            wine targets. Recommended action: include one wine pairing reminder in pre-shift briefing.
          </p>
        </div>
      </div>
    </ManagerLayout>
  );
}
