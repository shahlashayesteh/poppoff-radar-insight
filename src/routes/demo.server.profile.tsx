import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";

export const Route = createFileRoute("/demo/server/profile")({ component: Page });

const milestones = [
  { label: "First week logged", done: true },
  { label: "Hit weekly dessert target", done: true },
  { label: "5-week streak", done: true },
  { label: "Top 3 in venue leaderboard", done: false },
  { label: "Hit weekly wine target", done: false },
];

function Page() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Profile</h1>

        <div className="mt-6 rounded-2xl bg-white border border-border p-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-brand-green/15 grid place-items-center text-brand-green text-lg font-bold">
            S
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base truncate">Sarah</div>
            <div className="text-xs text-muted-foreground truncate">The Demo Restaurant · Server</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-border p-4">
            <div className="text-xs text-muted-foreground">Current streak</div>
            <div className="font-display text-2xl font-extrabold mt-1">5 weeks</div>
          </div>
          <div className="rounded-2xl bg-white border border-border p-4">
            <div className="text-xs text-muted-foreground">Total uplift</div>
            <div className="font-display text-2xl font-extrabold mt-1">£140</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-5">
          <div className="font-display text-lg font-bold">Milestones</div>
          <ul className="mt-3 space-y-2">
            {milestones.map((m) => (
              <li key={m.label} className="flex items-center gap-3 text-sm">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: m.done ? "var(--brand-green)" : "var(--muted-foreground)" }}
                />
                <span className={m.done ? "" : "text-muted-foreground"}>{m.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => {}}
          className="mt-6 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground"
          aria-disabled
        >
          Sign out (disabled in demo)
        </button>
      </div>
    </ServerLayout>
  );
}
