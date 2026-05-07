import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/manager/menu")({
  component: MenuIntel,
});

function MenuIntel() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-4xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Menu Intelligence</h1>
        <div className="mt-8 rounded-2xl bg-white border border-border p-8 text-center text-sm text-muted-foreground">
          No menu uploaded yet. Upload your menu to unlock AI-powered pairing and coaching suggestions.
        </div>
      </div>
    </ManagerLayout>
  );
}
