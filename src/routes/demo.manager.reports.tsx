import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/demo/manager/reports")({ component: Page });

const weeks = [
  { week_start: "2025-05-05", label: "5 May to 11 May", servers: 5, covers: 812, sales: 47420, spc: 58.4, current: true },
  { week_start: "2025-04-28", label: "28 Apr to 4 May", servers: 5, covers: 786, sales: 44210, spc: 56.25 },
  { week_start: "2025-04-21", label: "21 Apr to 27 Apr", servers: 5, covers: 803, sales: 45380, spc: 56.51 },
  { week_start: "2025-04-14", label: "14 Apr to 20 Apr", servers: 4, covers: 742, sales: 41020, spc: 55.28 },
  { week_start: "2025-04-07", label: "7 Apr to 13 Apr", servers: 4, covers: 765, sales: 41890, spc: 54.76 },
  { week_start: "2025-03-31", label: "31 Mar to 6 Apr", servers: 4, covers: 728, sales: 39810, spc: 54.68 },
];

function Page() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Week-by-week venue performance.</p>

        <div className="mt-6 grid md:grid-cols-4 gap-4">
          {[
            { label: "Total covers (this week)", value: "812" },
            { label: "Avg spend per cover", value: "£58.40" },
            { label: "Estimated uplift", value: "£1,420", accent: true },
            { label: "Stats viewed", value: "4 of 5" },
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
                    {w.current && <span className="ml-2 text-xs font-normal text-brand-green">current</span>}
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
