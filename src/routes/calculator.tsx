import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/calculator")({
  component: CalculatorLayout,
});

function CalculatorLayout() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1100px] px-6 pt-12">
        <p className="mb-5 font-mono text-xs uppercase tracking-[0.18em] text-brand-orange">
          PoppOff · Floor Leverage Tools
        </p>
        <nav
          aria-label="Calculator tools"
          className="inline-flex rounded-full border border-border bg-card p-1"
        >
          <Link
            to="/calculator"
            activeOptions={{ exact: true }}
            activeProps={{
              className:
                "bg-foreground text-background shadow-sm",
            }}
            inactiveProps={{
              className: "text-muted-foreground hover:text-foreground",
            }}
            className="rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-[0.14em] transition-colors"
          >
            Quick Check
          </Link>
          <Link
            to="/calculator/server-gap"
            activeProps={{
              className: "bg-foreground text-background shadow-sm",
            }}
            inactiveProps={{
              className: "text-muted-foreground hover:text-foreground",
            }}
            className="rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-[0.14em] transition-colors"
          >
            Upload POS Data
          </Link>
        </nav>
      </div>
      <Outlet />
    </main>
  );
}
