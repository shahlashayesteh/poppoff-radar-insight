import { createFileRoute, redirect } from "@tanstack/react-router";

// /settings → /manager/settings (Phase 1A route cleanup).
// Settings is a manager surface and now lives under /manager/settings so the
// active venue context, manager role gate and breadcrumb structure are
// consistent with the rest of the manager app.
export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/manager/settings" });
  },
});
