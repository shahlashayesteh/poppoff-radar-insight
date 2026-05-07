import { createFileRoute, Link } from "@tanstack/react-router";
import { demoServers, demoVenue } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/team")({
  component: DemoTeam,
});

function DemoTeam() {
  return (
    <div className="px-8 py-7">
      <div>
        <div className="font-display text-2xl font-extrabold tracking-tight uppercase" style={{ color: "var(--brand-green)" }}>
          Team
        </div>
        <div className="text-sm text-muted-foreground tracking-widest uppercase">{demoVenue.name}</div>
      </div>

      <div className="mt-6 rounded-2xl bg-white border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-3">Server</th>
              <th className="text-right px-5 py-3">Covers</th>
              <th className="text-right px-5 py-3">Spend / cover</th>
              <th className="text-right px-5 py-3">Est. uplift</th>
              <th className="text-right px-5 py-3">Streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {demoServers.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-5 py-4">
                  <Link to="/demo/server/$id" params={{ id: s.id }} className="flex items-center gap-3 font-semibold">
                    <span className="h-8 w-8 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-xs font-bold">
                      {s.name[0]}
                    </span>
                    {s.name}
                  </Link>
                </td>
                <td className="px-5 py-4 text-right">{s.covers}</td>
                <td className="px-5 py-4 text-right font-bold">{s.spendPerCover}</td>
                <td className="px-5 py-4 text-right text-brand-green font-semibold">{s.upliftEstimate}</td>
                <td className="px-5 py-4 text-right">{s.streak} shifts</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
