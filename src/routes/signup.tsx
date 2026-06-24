import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  component: SignupLayout,
});

function SignupLayout() {
  return <Outlet />;
}
