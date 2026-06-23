import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { servers } from "@/lib/sample-data";
import { publicDemoRouteHandler } from "@/lib/public-demo-html";

export const Route = createFileRoute("/demo/manager/server/")({
  server: {
    handlers: {
      GET: publicDemoRouteHandler,
      HEAD: publicDemoRouteHandler,
    },
  },
  component: Page,
});

function Page() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Individual servers</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pick a server to see their detailed scorecard.</p>
        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          {servers.map((m) => (
            <Link
              key={m.id}
              to="/demo/manager/server/$id"
              params={{ id: m.id }}
              className="rounded-2xl border border-border bg-white p-4 hover:border-brand-green"
            >
              <div className="font-semibold text-sm">{m.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Weekly focus: {m.weeklyFocus} · View scorecard →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </ManagerLayout>
  );
}
