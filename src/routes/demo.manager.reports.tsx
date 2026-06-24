import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { demoManagerKpis, demoWeeklyHistory } from "@/lib/sample-data";

export const Route = createFileRoute("/demo/manager/reports")({ component: Page });

const weeks = demoWeeklyHistory;

function Page() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Week-by-week venue performance.</p>

        <div className="mt-6 grid md:grid-cols-4 gap-4">
          {[
            {
              label: "Total covers (this week)",
              value: demoManagerKpis.totalCovers.toLocaleString(),
            },
            { label: "Avg spend per cover", value: `£${demoManagerKpis.avgSpc.toFixed(2)}` },
            {
              label: "Estimated uplift",
              value: `£${demoManagerKpis.uplift.toLocaleString()}`,
              accent: true,
            },
            {
              label: "Stats viewed",
              value: `${demoManagerKpis.viewedCount} of ${demoManagerKpis.totalServers}`,
            },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white border border-border p-5">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div
                className="mt-2 font-display text-2xl font-semibold"
                style={{ color: c.accent ? "var(--success)" : undefined }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-5 py-3 font-medium">Week</th>
                <th className="px-3 py-3 font-medium">Servers</th>
                <th className="px-3 py-3 font-medium">Covers</th>
                <th className="px-3 py-3 font-medium">Sales</th>
                <th className="px-3 py-3 font-medium">SPC</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week_start} className="border-t border-border">
                  <td className="px-5 py-4 font-semibold">
                    {w.label}
                    {"current" in w && w.current && (
                      <span className="ml-2 text-xs font-normal text-brand-green">current</span>
                    )}
                  </td>
                  <td className="px-3">{w.servers}</td>
                  <td className="px-3">{w.covers.toLocaleString()}</td>
                  <td className="px-3">£{w.sales.toLocaleString()}</td>
                  <td className="px-3 font-semibold">£{w.spc.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}
