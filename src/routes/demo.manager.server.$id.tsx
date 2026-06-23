import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { StatusBadge, StatusDot } from "@/components/status";
import { servers, sarahCategories } from "@/lib/sample-data";

export const Route = createFileRoute("/demo/manager/server/$id")({
  component: ServerView,
});

function ServerView() {
  const { id } = Route.useParams();
  const server = servers.find((s) => s.id === id) ?? servers[0];

  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <Link to="/demo/manager" className="text-sm text-muted-foreground hover:text-ink">← Back to dashboard</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Server view</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">{server.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={server.overall}>Overall {server.overall}</StatusBadge>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mt-8 grid md:grid-cols-4 gap-4">
          {[
            { label: "Strongest category", value: "Desserts" },
            { label: "Biggest opportunity", value: "Wine" },
            { label: "Stats viewed", value: "3 times this week" },
            { label: "Estimated uplift", value: `£${server.uplift}`, accent: "success" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white border border-border p-5">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-2 font-display text-2xl font-semibold" style={{ color: (c as any).accent ? "var(--success)" : undefined }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          {/* Category breakdown */}
          <div className="lg:col-span-2 rounded-2xl bg-white border border-border p-6">
            <h2 className="font-display text-lg font-semibold">Category breakdown</h2>
            <div className="mt-4 space-y-3">
              {sarahCategories.map((c) => (
                <div key={c.key} className="flex items-center gap-4">
                  <StatusDot status={c.status} />
                  <div className="w-32 text-sm font-medium">{c.name}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.score}%`,
                        backgroundColor: c.status === "green" ? "var(--success)" : c.status === "amber" ? "var(--warning)" : "var(--opportunity)",
                      }}
                    />
                  </div>
                  <div className="w-10 text-right text-xs text-muted-foreground">{c.score}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Engagement */}
          <div className="rounded-2xl bg-ink text-white p-6">
            <div className="text-xs uppercase tracking-widest text-white/60">Engagement</div>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Stats viewed</span>
                <span className="font-medium">{server.viewed ? "Yes" : "Not yet"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Focus acknowledged</span>
                <span className="font-medium">{server.acknowledged ? "Yes" : "Not yet"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Weekly focus</span>
                <span className="font-medium">{server.weeklyFocus}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI talking points */}
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white border border-border p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">AI manager talking points</div>
            <p className="mt-3 text-foreground">
              {server.name} is strong on desserts but has a wine opportunity compared with similar dinner shifts. Coaching
              should focus on one confident pairing recommendation, especially with salmon and steak tables.
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-border p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Menu-specific coaching</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex gap-2"><span className="text-success">•</span> Recommend Sancerre with salmon.</li>
              <li className="flex gap-2"><span className="text-success">•</span> Recommend Malbec with ribeye steak.</li>
              <li className="flex gap-2"><span className="text-success">•</span> Offer Espresso Martini after Chocolate Fondant.</li>
            </ul>
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
