import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Calendar, Copy } from "lucide-react";
import { demoVenue, demoServers } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/")({
  component: DemoDashboard,
});

function DemoDashboard() {
  return (
    <div className="px-8 py-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display text-2xl font-extrabold tracking-tight uppercase" style={{ color: "var(--brand-green)" }}>
            Manager Dashboard
          </div>
          <div className="text-sm text-muted-foreground tracking-widest uppercase">
            {demoVenue.name}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium">
            <Calendar className="h-4 w-4" /> This week
          </button>
          <button className="relative h-10 w-10 grid place-items-center rounded-full border border-border bg-white">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full text-[10px] font-bold text-white grid place-items-center" style={{ background: "var(--brand-orange)" }}>3</span>
          </button>
        </div>
      </div>

      {/* Join code */}
      <div className="mt-6 rounded-2xl bg-white border border-border p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Team join code</div>
            <div className="mt-1 font-display text-4xl font-extrabold tracking-widest" style={{ color: "var(--brand-green)" }}>
              {demoVenue.joinCode}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Servers join at <span className="font-semibold text-foreground">/join</span> with this code.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold">
            <Copy className="h-4 w-4" /> Copy
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI label="Avg spend per cover" value="£58.40" trend="+8% WoW" />
        <KPI label="Covers this week" value="812" trend="+124 vs last week" />
        <KPI label="Estimated uplift" value="£1,420" trend="from coaching priorities" />
      </div>

      {/* Team leaderboard */}
      <div className="mt-6 rounded-2xl bg-white border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Team leaderboard</h2>
          <Link to="/demo/team" className="text-xs font-semibold text-brand-green">View all →</Link>
        </div>
        <div className="divide-y divide-border">
          {demoServers.map((s, i) => (
            <Link
              key={s.id}
              to="/demo/server/$id"
              params={{ id: s.id }}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40"
            >
              <div className="flex items-center gap-4">
                <div className="h-9 w-9 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-xs font-bold">
                  {s.name[0]}
                </div>
                <div>
                  <div className="font-semibold">{i + 1}. {s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.covers} covers · {s.streak}-shift streak</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold">{s.spendPerCover}</div>
                <div className="text-xs text-muted-foreground">spend / cover</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 text-xs text-muted-foreground flex items-center justify-between">
        <span>ⓘ Demo data — your real numbers will appear once your team starts logging shifts.</span>
        <span><span className="font-bold" style={{ color: "var(--brand-orange)" }}>Popp</span><span className="font-bold" style={{ color: "var(--brand-green)" }}>Off</span>. Every shift. Every win.</span>
      </div>
    </div>
  );
}

function KPI({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-2xl bg-white border border-border p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
      <div className="mt-2 font-display text-3xl font-extrabold">{value}</div>
      <div className="mt-1 text-xs text-brand-green font-semibold">{trend}</div>
    </div>
  );
}
