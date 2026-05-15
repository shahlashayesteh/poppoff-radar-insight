import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";
import { performanceColour } from "@/lib/week";

export const Route = createFileRoute("/demo/server/stats")({ component: Page });

type Row = { label: string; conversion: number; target: number; items: number; prevItems: number };

const rows: Row[] = [
  { label: "Wine", conversion: 42, target: 65, items: 18, prevItems: 24 },
  { label: "Cocktails", conversion: 81, target: 70, items: 32, prevItems: 27 },
  { label: "Desserts", conversion: 88, target: 75, items: 41, prevItems: 36 },
  { label: "Sides", conversion: 38, target: 60, items: 22, prevItems: 28 },
  { label: "Spirits", conversion: 58, target: 55, items: 14, prevItems: 12 },
  { label: "Sparkling", conversion: 64, target: 70, items: 19, prevItems: 17 },
];

function pctDelta(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function Page() {
  const totalItemsCurrent = rows.reduce((s, r) => s + r.items, 0);
  const totalItemsPrev = rows.reduce((s, r) => s + r.prevItems, 0);
  const totalDelta = pctDelta(totalItemsCurrent, totalItemsPrev);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats</h1>
        <div className="mt-1 text-xs text-muted-foreground">4 May to 10 May</div>

        <div className="mt-6 space-y-3">
          <div className="rounded-2xl bg-white border border-border p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Items sold this week</div>
              <div className="font-display text-2xl font-extrabold">{totalItemsCurrent}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">vs last week</div>
              <div
                className="font-semibold"
                style={{
                  color:
                    totalDelta === null
                      ? "var(--muted-foreground)"
                      : totalDelta >= 0
                      ? "var(--brand-green)"
                      : "var(--opportunity)",
                }}
              >
                {totalDelta === null ? "—" : `${totalDelta >= 0 ? "↑" : "↓"} ${Math.abs(totalDelta).toFixed(0)}%`}
              </div>
            </div>
          </div>
          {rows.map((r) => {
            const colour = performanceColour(r.conversion, r.target);
            const tone =
              colour === "green"
                ? "var(--brand-green)"
                : colour === "amber"
                ? "var(--brand-orange)"
                : "var(--opportunity)";
            const d = pctDelta(r.items, r.prevItems);
            return (
              <div key={r.label} className="rounded-2xl bg-white border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-sm font-bold" style={{ color: tone }}>
                    {r.items} sold
                    {d !== null && (
                      <span
                        className="ml-2 text-xs"
                        style={{ color: d >= 0 ? "var(--brand-green)" : "var(--opportunity)" }}
                      >
                        {d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${Math.min(100, r.conversion)}%`, background: tone }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ServerLayout>
  );
}
