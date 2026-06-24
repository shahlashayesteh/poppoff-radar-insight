import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { servers } from "@/lib/sample-data";
import { Bell, ChevronDown, Calendar, Users, PoundSterling, TrendingUp, Eye, Wine, Cake, Droplet, Target, Flame, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/demo/manager/")({
  component: ManagerDashboard,
});

const Stat = ({ icon: Icon, tone, label, value, sub, subTone }: any) => (
  <div className="rounded-2xl bg-white border border-border p-4">
    <div className="flex items-start gap-3">
      <div className="h-11 w-11 rounded-full grid place-items-center" style={{ background: `color-mix(in oklab, ${tone} 14%, white)` }}>
        <Icon className="h-5 w-5" style={{ color: tone }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-extrabold mt-0.5">{value}</div>
        {sub && <div className="text-xs mt-1 font-medium" style={{ color: subTone ?? "var(--brand-green)" }}>{sub}</div>}
      </div>
    </div>
  </div>
);

const dotColor = (s: "green"|"amber"|"red") =>
  s === "green" ? "var(--brand-green)" : s === "amber" ? "var(--brand-orange)" : "var(--opportunity)";

const Dot = ({ s }: { s: "green"|"amber"|"red" }) => (
  <span className="inline-block h-3 w-3 rounded-full" style={{ background: dotColor(s) }} />
);

const cats: Array<{ key: keyof typeof servers[0]; label: string }> = [
  { key: "wine", label: "Wine" },
  { key: "cocktails", label: "Cocktails" },
  { key: "desserts", label: "Desserts" },
  { key: "sides", label: "Sides" },
  { key: "spc", label: "Spirits" },
  { key: "water", label: "Sparkling" },
] as any;

function ManagerDashboard() {
  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight uppercase" style={{ color: "var(--brand-green)" }}>
              Manager Dashboard
            </div>
            <div className="text-sm text-muted-foreground tracking-widest uppercase">Complete Visibility</div>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium">
              The Demo Restaurant <ChevronDown className="h-4 w-4" />
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium">
              <Calendar className="h-4 w-4" /> 4 May – 10 May
            </button>
            <button className="relative h-10 w-10 grid place-items-center rounded-full border border-border bg-white">
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-brand-green" />
            </button>
          </div>
        </div>

        {/* KPI grid 4x2 */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={Users} tone="var(--brand-green)" label="Total Covers" value="812" sub="▲ +5% vs last week" />
          <Stat icon={PoundSterling} tone="var(--brand-green)" label="Avg Spend per Cover" value="£58.40" sub="▲ +6.3% vs last week" />
          <Stat icon={TrendingUp} tone="var(--brand-green)" label="Modelled opportunity (week)" value="£1,420" sub="▲ +8% vs last week" />
          <Stat icon={Eye} tone="var(--brand-green)" label="Server Viewed Stats" value="4 / 5" sub="80%" subTone="var(--muted-foreground)" />

          <Stat icon={Wine} tone="oklch(0.55 0.18 290)" label="Wine modelled opportunity" value="£620" sub="▲ +11% vs last week" />
          <Stat icon={Cake} tone="var(--opportunity)" label="Dessert Performance" value="+14%" sub="vs last week" />
          <Stat icon={Droplet} tone="oklch(0.65 0.15 240)" label="Bottled Water Progress" value="+9%" sub="vs last week" />
          <Stat icon={Target} tone="var(--opportunity)" label="Red Opportunities" value="7" sub="▼ this week" subTone="var(--opportunity)" />
        </div>

        {/* Team performance */}
        <div className="mt-6 rounded-2xl bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Team Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Server</th>
                  {cats.map((c) => <th key={c.label} className="px-3 py-3 font-medium">{c.label}</th>)}
                  <th className="text-left px-3 py-3 font-medium">Weekly Focus</th>
                  <th className="px-3 py-3 font-medium">Stats Viewed</th>
                  <th className="px-3 py-3 font-medium">Focus Ack.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-5 py-4 font-semibold">{s.name}</td>
                    {cats.map((c) => (
                      <td key={c.label} className="px-3 text-center"><Dot s={(s as any)[c.key]} /></td>
                    ))}
                    <td className="px-3 text-foreground/80">{s.weeklyFocus}</td>
                    <td className={`px-3 text-center font-semibold ${s.viewed ? "text-brand-green" : "text-opportunity"}`}>{s.viewed ? "Yes" : "No"}</td>
                    <td className={`px-3 text-center font-semibold ${s.acknowledged ? "text-brand-green" : "text-opportunity"}`}>{s.acknowledged ? "Yes" : "No"}</td>
                    <td className="px-3">
                      <Link to="/demo/manager/server/$id" params={{ id: s.id }} className="text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom cards */}
        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          {/* Coaching priorities */}
          <div className="rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold">This Week's Coaching Priorities</h3>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {[
                { i: Wine, t: "Wine Attachment", d: "Drive wine by the glass growth in punchlines.", c: "oklch(0.55 0.18 290)" },
                { i: Cake, t: "Dessert Recommendation", d: "Lead with dessert recommendation in punchlines.", c: "var(--opportunity)" },
                { i: Flame, t: "Truffle Showcase", d: "Recommend truffle across key dishes.", c: "var(--brand-orange)" },
                { i: Droplet, t: "Bottled Water", d: "Keep offering bottled water every shift.", c: "oklch(0.65 0.15 240)" },
              ].map((p) => (
                <div key={p.t} className="flex gap-3">
                  <div className="h-9 w-9 rounded-full grid place-items-center shrink-0" style={{ background: `color-mix(in oklab, ${p.c} 14%, white)` }}>
                    <p.i className="h-4 w-4" style={{ color: p.c }} />
                  </div>
                  <div>
                    <div className="font-semibold">{p.t}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl text-xs px-3 py-2 flex items-center gap-2"
              style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", color: "var(--brand-green)" }}>
              ✦ Focus these priorities in pre-shift huddles and 1:1s this week.
            </div>
          </div>

          {/* Manager insight */}
          <div className="rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold">Manager Insight</h3>
            <p className="mt-3 text-sm text-foreground/80">
              You're on track! Keep up the coaching consistency and focus on wine attachment to unlock more uplift.
            </p>
            <svg viewBox="0 0 200 60" className="mt-4 w-full h-20">
              <path d="M0,55 C30,52 50,48 70,42 S110,30 130,22 S180,8 200,4" fill="none" stroke="var(--brand-green)" strokeWidth="3" strokeLinecap="round" />
              <path d="M195,12 L200,4 L192,2" fill="none" stroke="var(--brand-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mt-2 text-sm"><span className="text-brand-green font-bold">+£1,420</span> <span className="text-muted-foreground">potential uplift this week</span></div>
          </div>

          {/* Focus ack */}
          <div className="rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold">Focus Acknowledgement</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-24 w-24">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="color-mix(in oklab, var(--brand-green) 14%, white)" strokeWidth="10" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--brand-green)" strokeWidth="10"
                    strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * 0.2} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 grid place-items-center font-display text-xl font-extrabold">80%</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Team has acknowledged this week's focus</div>
                <div className="mt-2 font-display text-xl font-extrabold text-brand-green">4/5 servers</div>
                <div className="text-xs text-muted-foreground">acknowledged</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground flex items-center justify-between">
          <span>ⓘ All data is based on the selected date range. Metrics update nightly.</span>
          <span><span className="font-bold" style={{ color: "var(--brand-orange)" }}>Popp</span><span className="font-bold" style={{ color: "var(--brand-green)" }}>Off</span>. Every shift. Every win.</span>
        </div>
      </div>
    </ManagerLayout>
  );
}
