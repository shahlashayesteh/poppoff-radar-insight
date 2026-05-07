import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { demoServers } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/server/$id")({
  component: DemoServerDetail,
});

function DemoServerDetail() {
  const { id } = Route.useParams();
  const server = demoServers.find((s) => s.id === id);
  if (!server) throw notFound();

  return (
    <div className="px-8 py-7">
      <Link to="/demo/team" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
        ← Back to team
      </Link>
      <div className="mt-3 flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-xl font-bold">
          {server.name[0]}
        </div>
        <div>
          <div className="font-display text-3xl font-extrabold tracking-tight">{server.name}</div>
          <div className="text-sm text-muted-foreground">{server.streak}-shift streak</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Spend / cover" value={server.spendPerCover} />
        <Stat label="Covers this week" value={String(server.covers)} />
        <Stat label="Estimated uplift" value={server.upliftEstimate} />
      </div>

      <div className="mt-6 rounded-2xl bg-white border border-border p-5">
        <h3 className="font-display font-bold">Coaching focus</h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li>• Push the Aperol Spritz earlier in service.</li>
          <li>• Mention dessert by name when clearing mains.</li>
          <li>• Suggest the Espresso Martini after dessert.</li>
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-border p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
      <div className="mt-2 font-display text-3xl font-extrabold">{value}</div>
    </div>
  );
}
