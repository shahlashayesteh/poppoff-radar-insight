import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy duplicate of /demo/server. Redirected so any external links or
// stale bookmarks land on the canonical demo route.
export const Route = createFileRoute("/demo/server-scorecard")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/server" });
  },
});
