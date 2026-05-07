import { createFileRoute } from "@tanstack/react-router";
import { demoMenuItems, demoVenue } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/menu")({
  component: DemoMenu,
});

function DemoMenu() {
  return (
    <div className="px-8 py-7">
      <div>
        <div className="font-display text-2xl font-extrabold tracking-tight uppercase" style={{ color: "var(--brand-green)" }}>
          Menu Intelligence
        </div>
        <div className="text-sm text-muted-foreground tracking-widest uppercase">{demoVenue.name}</div>
      </div>

      <div className="mt-6 rounded-2xl bg-white border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-3">Item</th>
              <th className="text-right px-5 py-3">Attach rate</th>
              <th className="text-right px-5 py-3">7-day trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {demoMenuItems.map((m) => (
              <tr key={m.name}>
                <td className="px-5 py-4 font-semibold">{m.name}</td>
                <td className="px-5 py-4 text-right font-bold">{m.attachRate}</td>
                <td className={`px-5 py-4 text-right font-semibold ${m.trend.startsWith("-") ? "text-destructive" : "text-brand-green"}`}>
                  {m.trend}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
