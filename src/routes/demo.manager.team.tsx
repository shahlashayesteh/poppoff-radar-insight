import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { servers } from "@/lib/sample-data";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/demo/manager/team")({
  component: TeamTrends,
});

const spcTrend = [
  { week: "W1", spc: 52 },
  { week: "W2", spc: 54 },
  { week: "W3", spc: 56 },
  { week: "W4", spc: 58.4 },
];

const wineByServer = servers.map((s) => ({ name: s.name, score: s.wine === "green" ? 85 : s.wine === "amber" ? 60 : 40 }));
const dessertByServer = servers.map((s) => ({ name: s.name, score: s.desserts === "green" ? 88 : s.desserts === "amber" ? 62 : 38 }));
const waterByServer = servers.map((s) => ({ name: s.name, score: s.water === "green" ? 82 : s.water === "amber" ? 64 : 36 }));
const engagementByServer = servers.map((s) => ({ name: s.name, score: s.viewed ? (s.acknowledged ? 100 : 70) : 20 }));

function ChartCard({ title, children }: any) {
  return (
    <div className="rounded-2xl bg-white border border-border p-5">
      <div className="text-sm font-medium mb-3">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function TeamTrends() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Team Trends</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">How the team is moving.</h1>

        <div className="mt-8 grid md:grid-cols-4 gap-4">
          {[
            { label: "Best improving", value: "Sarah", note: "+12% week on week" },
            { label: "Most consistent", value: "Maria", note: "Green 6 weeks running" },
            { label: "Most improved category", value: "Bottled Water", note: "+8%" },
            { label: "Weakest this week", value: "Wine", note: "3 servers below target" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white border border-border p-5">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-2 font-display text-xl font-semibold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.note}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid lg:grid-cols-2 gap-4">
          <ChartCard title="Average spend per cover (£)">
            <LineChart data={spcTrend}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="spc" stroke="var(--success)" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ChartCard>
          <ChartCard title="Wine score by server">
            <BarChart data={wineByServer}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="score" fill="var(--ink)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Dessert score by server">
            <BarChart data={dessertByServer}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="score" fill="var(--success)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Bottled water score by server">
            <BarChart data={waterByServer}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="score" fill="var(--warning)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Scorecard engagement by server">
            <BarChart data={engagementByServer}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="score" fill="var(--ink)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartCard>
          <div className="rounded-2xl bg-ink text-white p-6">
            <div className="text-xs uppercase tracking-widest text-white/60">Servers who have not viewed stats</div>
            <div className="mt-4 space-y-2">
              {servers.filter((s) => !s.viewed).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-white/60">Reminder needed</span>
                </div>
              ))}
              {servers.every((s) => s.viewed) && <div className="text-sm text-white/60">Everyone has viewed this week.</div>}
            </div>
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
