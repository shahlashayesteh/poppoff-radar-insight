import { createFileRoute } from "@tanstack/react-router";
import { demoPriorities, demoVenue } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/priorities")({
  component: DemoPriorities,
});

function DemoPriorities() {
  return (
    <div className="px-8 py-7">
      <div>
        <div className="font-display text-2xl font-extrabold tracking-tight uppercase" style={{ color: "var(--brand-green)" }}>
          Weekly Priorities
        </div>
        <div className="text-sm text-muted-foreground tracking-widest uppercase">{demoVenue.name}</div>
      </div>

      <div className="mt-6 space-y-3">
        {demoPriorities.map((p, i) => (
          <div key={i} className="rounded-2xl bg-white border border-border p-5">
            <div className="flex items-start gap-3">
              <span className="h-7 w-7 rounded-full grid place-items-center text-xs font-bold text-white" style={{ background: "var(--brand-orange)" }}>
                {i + 1}
              </span>
              <div>
                <div className="font-display font-bold">{p.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{p.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
