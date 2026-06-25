// Phase 15 — Manager Data Function Migration and Reports Guarding.
//
// Verifies:
//   - getManagerReportsData exists, calls requirePaidManagerEntitlement,
//     and blocks cancelled/expired/unknown users + past_due beyond grace.
//   - /manager/reports uses the guarded server function (not direct RLS).
//   - Menu / priorities / coaching / team primary reads now use the
//     guarded server functions instead of direct supabase table reads.
//   - Server routes still do not import manager-data.functions.
//   - Public + demo routes remain untouched.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

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
const isoOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

// ---------- Reports server function ----------

describe("Phase 15 — getManagerReportsData", () => {
  const src = read("src/lib/manager-data.functions.ts");

  it("is exported and uses requirePaidManagerEntitlement", () => {
    expect(src).toMatch(/export const getManagerReportsData = createServerFn/);
    const handler = src
      .split("export const getManagerReportsData")[1]
      ?.split("export const")[0] ?? "";
    expect(handler).toMatch(/requirePaidManagerEntitlement\(/);
  });

  it("aggregates server_stats per week and computes RPC + WoW deltas", () => {
    const handler = src
      .split("export const getManagerReportsData")[1]
      ?.split("export const")[0] ?? "";
    expect(handler).toMatch(/from\(["']server_stats["']\)/);
    expect(handler).toMatch(/wowSalesPct/);
    expect(handler).toMatch(/wowRpcPct/);
    expect(handler).toMatch(/rpc:/);
  });

  // Entitlement parity for the reports flow — same guard, same behaviour.
  it("active user passes the reports entitlement guard", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("active"), "u")).resolves.toBeUndefined();
  });
  it("cancelled user is blocked from reports", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("canceled"), "u")).rejects.toThrow();
  });
  it("expired user is blocked from reports", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase("incomplete_expired"), "u")).rejects.toThrow();
  });
  it("unknown user (no subscription row) is blocked from reports", async () => {
    await expect(requirePaidManagerEntitlement(fakeSupabase(null), "u")).rejects.toThrow();
  });
  it("past_due beyond 7-day grace is blocked from reports", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabase("past_due", isoOffset(-10)), "u"),
    ).rejects.toThrow();
  });
  it("past_due within 7-day grace is allowed for reports", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabase("past_due", isoOffset(-3)), "u"),
    ).resolves.toBeUndefined();
  });
});

// ---------- Route migrations ----------

describe("Phase 15 — paid manager routes call guarded server functions", () => {
  const cases: Array<{ route: string; mustImport: RegExp; mustInvoke: RegExp }> = [
    {
      route: "src/routes/manager.reports.tsx",
      mustImport: /getManagerReportsData/,
      mustInvoke: /useServerFn\(getManagerReportsData\)/,
    },
    {
      route: "src/routes/manager.menu.tsx",
      mustImport: /listMenuSuggestions[^;]*listVenueMenus|listVenueMenus[^;]*listMenuSuggestions/,
      mustInvoke: /useServerFn\(listMenuSuggestions\)/,
    },
    {
      route: "src/routes/manager.priorities.tsx",
      mustImport: /listWeeklyPriorities/,
      mustInvoke: /useServerFn\(listWeeklyPriorities\)/,
    },
    {
      route: "src/routes/manager.coaching.tsx",
      mustImport: /listCoachingPriorities/,
      mustInvoke: /useServerFn\(listCoachingPriorities\)/,
    },
    {
      route: "src/routes/manager.team.tsx",
      mustImport: /getTeamAnalytics/,
      mustInvoke: /useServerFn\(getTeamAnalytics\)/,
    },
  ];

  for (const c of cases) {
    it(`${c.route} migrates primary read to a guarded server function`, () => {
      const src = read(c.route);
      expect(src, "must import the guarded function").toMatch(c.mustImport);
      expect(src, "must wrap with useServerFn").toMatch(c.mustInvoke);
    });
  }

  it("/manager/reports no longer imports the browser supabase client", () => {
    const src = read("src/routes/manager.reports.tsx");
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
  });
});

// ---------- Isolation ----------

describe("Phase 15 — server + public routes unchanged", () => {
  it("server routes do not import manager-data.functions", () => {
    const candidates = [
      "src/routes/server.index.tsx",
      "src/routes/server.coaching.tsx",
      "src/routes/server.rewards.tsx",
      "src/routes/server.stats.tsx",
      "src/routes/server.leaderboard.tsx",
      "src/routes/server.menu.tsx",
      "src/routes/server.progress.tsx",
      "src/routes/server.profile.tsx",
    ].filter((p) => fs.existsSync(path.resolve(process.cwd(), p)));
    for (const rel of candidates) {
      expect(read(rel), `${rel} must NOT import manager-data.functions`).not.toMatch(
        /manager-data\.functions/,
      );
    }
  });

  it("calculator + demo routes do not import manager-data.functions", () => {
    const publicRoutes = [
      "src/routes/calculator.tsx",
      "src/routes/calculator.index.tsx",
      "src/routes/calculator.server-gap.tsx",
      "src/routes/demo.manager.index.tsx",
      "src/routes/demo.server.index.tsx",
      "src/routes/demo.manager.reports.tsx",
    ].filter((p) => fs.existsSync(path.resolve(process.cwd(), p)));
    for (const rel of publicRoutes) {
      expect(read(rel), `${rel} must NOT import manager-data.functions`).not.toMatch(
        /manager-data\.functions/,
      );
    }
  });
});
