import { createFileRoute, redirect } from "@tanstack/react-router";

// /login was a legacy demo-chooser that confused users with real sign-in.
// All real auth happens at /signin; demo entry points are linked from /demo/*.
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/signin" });
  },
});
