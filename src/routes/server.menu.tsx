import { createFileRoute } from "@tanstack/react-router";
import { ServerLayout } from "@/components/server-layout";

export const Route = createFileRoute("/server/menu")({
  component: ServerMenu,
});

function ServerMenu() {
  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Coaching</h1>
        <div className="mt-6 rounded-3xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">
          No menu uploaded yet. Your manager will share coaching once your menu is added.
        </div>
      </div>
    </ServerLayout>
  );
}
