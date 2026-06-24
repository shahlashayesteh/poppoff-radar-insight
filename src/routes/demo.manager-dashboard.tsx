import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy duplicate of /demo/manager. Redirected so any external links or
// stale bookmarks land on the canonical demo route.
export const Route = createFileRoute("/demo/manager-dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/manager" });
  },
});
