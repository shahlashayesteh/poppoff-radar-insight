// Phase 12A — Server-side entitlement guard tests.
//
// Verifies that requirePaidManagerEntitlement (the shared guard used by LLS,
// reports, menu, coaching, priorities, team and imports server functions)
// allows active/trialing/enterprise accounts through and blocks
// cancelled/expired/unknown — and that the import variant matches the
// stricter import policy.
import { describe, it, expect } from "vitest";
import {
  requirePaidManagerEntitlement,
  requireImportEntitlement,
} from "@/lib/entitlements-guard";

function fakeSupabase(status: string | null, currentPeriodEnd: string | null = null) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          return {
            data: status === null
              ? null
              : { status, current_period_end: currentPeriodEnd, cancel_at_period_end: false },
          };
        },
      };
    },
  } as any;
}

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

describe("requirePaidManagerEntitlement", () => {
  it("allows active accounts", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("active"), "u")).resolves.toBeUndefined();
  });
  it("allows trialing accounts", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("trialing"), "u")).resolves.toBeUndefined();
  });
  it("allows enterprise accounts", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("enterprise"), "u")).resolves.toBeUndefined();
  });
  it("blocks cancelled accounts (past grace)", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("canceled", past()), "u")).rejects.toThrow(/subscription/i);
  });
  it("blocks expired accounts", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("incomplete_expired"), "u")).rejects.toThrow();
  });
  it("blocks unknown accounts (no subscription row)", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase(null), "u")).rejects.toThrow();
  });
  it("blocks past_due (current grace behaviour blocks; UI shows warning)", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("past_due"), "u")).rejects.toThrow();
  });
  it("error message points users to billing settings", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase(null), "u")).rejects.toThrow(/settings#billing/);
  });
});

describe("requireImportEntitlement uses the shared guard with import policy", () => {
  it("blocks cancelled (grace) and expired the same way as paid manager", async () => {
    await expect(requireImportEntitlement(fakeSupabase("canceled", past()), "u")).rejects.toThrow();
    await expect(requireImportEntitlement(fakeSupabase("incomplete_expired"), "u")).rejects.toThrow();
  });
  it("allows active / trialing / enterprise", async () => {
    await expect(requireImportEntitlement(fakeSupabase("active"), "u")).resolves.toBeUndefined();
    await expect(requireImportEntitlement(fakeSupabase("trialing"), "u")).resolves.toBeUndefined();
    await expect(requireImportEntitlement(fakeSupabase("enterprise"), "u")).resolves.toBeUndefined();
  });
});

describe("Phase 12A route wiring (smoke)", () => {
  // Sanity check that every paid manager route now imports the gate. This is
  // a static-source check; it catches regressions where a future edit removes
  // the wrapper from a manager page.
  const paidRoutes = [
    "src/routes/manager.lls.index.tsx",
    "src/routes/manager.lls.compare.tsx",
    "src/routes/manager.reports.tsx",
    "src/routes/manager.menu.tsx",
    "src/routes/manager.coaching.tsx",
    "src/routes/manager.priorities.tsx",
    "src/routes/manager.team.tsx",
    "src/routes/manager.imports.index.tsx",
    "src/routes/manager.imports.$batchId.tsx",
  ];

  it("every paid manager route wraps its component in PaidManagerGate", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const rel of paidRoutes) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} should import PaidManagerGate`).toMatch(/PaidManagerGate/);
    }
  });

  it("server routes do not import manager-only entitlement UI", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverRoutes = [
      "src/routes/server.index.tsx",
      "src/routes/server.coaching.tsx",
      "src/routes/server.rewards.tsx",
    ].filter((p) => fs.existsSync(path.resolve(process.cwd(), p)));
    for (const rel of serverRoutes) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} must NOT import PaidManagerGate`).not.toMatch(/PaidManagerGate/);
      expect(src, `${rel} must NOT import entitlements-guard`).not.toMatch(/entitlements-guard/);
    }
  });

  it("public surfaces (calculator, demos) remain public — no entitlement gate", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const publicRoutes = [
      "src/routes/calculator.tsx",
      "src/routes/demo.tsx",
      "src/routes/demo.manager.tsx",
      "src/routes/demo.server.tsx",
    ].filter((p) => fs.existsSync(path.resolve(process.cwd(), p)));
    for (const rel of publicRoutes) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} must remain public`).not.toMatch(/PaidManagerGate/);
    }
  });
});
