// Phase 6 — Import management layout (sub-layout under /manager).
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useRoleGate } from "@/lib/auth-gate";

export const Route = createFileRoute("/manager/imports")({
  component: ImportsLayout,
});

function ImportsLayout() {
  const gate = useRoleGate("manager");
  if (gate.role !== "manager") return null;
  return <Outlet />;
}
