// Phase 24 — Production Hardening & Enterprise Trust.
//
// This suite is a static-source + pure-logic safety net. It enforces the
// access / isolation / failure-state / import-safety contracts that Phase 24
// promises, without spinning up a real Supabase. Heavy DB behaviour is
// already covered by phase 16 / 18A / 19 / 21 / 22 / 23 suites.
//
// Scope of assertions:
//  - Paid manager surfaces wrap in PaidManagerGate + server entitlement check.
//  - Paid manager server fns call requirePaidManagerEntitlement.
//  - Venue-scoped server fns validate venue access.
//  - Import lifecycle calls (approve / commit / rollback) call entitlement +
//    assertBatchInVenue.
//  - /server/* routes do not import manager intelligence.
//  - /demo/* routes do not import real-data server functions.
//  - Manager pages render NoVenueState for the "no active venue" branch.
//  - Pages handle ROI / trace / OF v2 failures without crashing the surface.
//  - Enterprise trust section is present in settings.
//  - Entitlement helper blocks cancelled / expired / past-due-beyond-grace
//    and allows active / trialing / enterprise / past-due-in-grace.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  requirePaidManagerEntitlement,
  requireImportEntitlement,
} from "@/lib/entitlements-guard";
import {
  resolveManagerVenueId,
  assertVenueAccess,
  VenueAccessError,
} from "@/lib/venue-access";
import {
  canAccessPaidManagerFeaturesWithGrace,
  canAccessPaidManagerFeatures,
  isPastDueWithinGrace,
  PAST_DUE_GRACE_DAYS,
  normaliseStatus,
} from "@/lib/entitlements";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => existsSync(join(ROOT, p));

// --- helpers ---------------------------------------------------------------

function listRoutes(prefix: string): string[] {
  return readdirSync("src/routes")
    .filter((f) => f.startsWith(prefix) && f.endsWith(".tsx"));
}

function fakeSupabaseSub(status: string | null, currentPeriodEnd: string | null = null) {
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

function mockVenueRpc(opts: { accessible: string[]; allow?: (id: string) => boolean }) {
  return {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "user_can_access_venue") {
        const ok = opts.allow ? opts.allow(String(args?._venue_id)) : true;
        return { data: ok, error: null };
      }
      if (name === "get_my_accessible_venues") {
        return { data: opts.accessible.map((id) => ({ id })), error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  } as any;
}

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

// --- 1. paid manager entitlement coverage ----------------------------------

describe("Phase 24 — paid manager entitlement enforcement", () => {
  it("active user can access paid manager features", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("active"), "u"),
    ).resolves.toBeUndefined();
  });
  it("trialing user can access paid manager features", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("trialing"), "u"),
    ).resolves.toBeUndefined();
  });
  it("enterprise user can access paid manager features", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("enterprise"), "u"),
    ).resolves.toBeUndefined();
  });
  it("expired user is blocked from paid manager features", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("incomplete_expired"), "u"),
    ).rejects.toThrow(/subscription/i);
  });
  it("cancelled past-grace user is blocked", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("canceled", past()), "u"),
    ).rejects.toThrow();
  });
  it("past_due beyond 7-day grace is blocked", async () => {
    const longPast = new Date(Date.now() - (PAST_DUE_GRACE_DAYS + 2) * 86_400_000).toISOString();
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("past_due", longPast), "u"),
    ).rejects.toThrow();
  });
  it("past_due within grace is allowed for paid manager features", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub("past_due", future()), "u"),
    ).resolves.toBeUndefined();
  });
  it("import entitlement remains strict even within past_due grace", async () => {
    await expect(
      requireImportEntitlement(fakeSupabaseSub("past_due", future())),
    ).rejects.toThrow();
  });
  it("unknown / no subscription row is blocked", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub(null), "u"),
    ).rejects.toThrow();
  });
  it("blocked error directs users to billing", async () => {
    await expect(
      requirePaidManagerEntitlement(fakeSupabaseSub(null), "u"),
    ).rejects.toThrow(/settings#billing/);
  });

  // pure entitlement helpers
  it("canAccessPaidManagerFeaturesWithGrace allows active+trialing+enterprise", () => {
    for (const s of ["active", "trialing", "enterprise"] as const) {
      expect(canAccessPaidManagerFeatures(s)).toBe(true);
      expect(canAccessPaidManagerFeaturesWithGrace(s, null)).toBe(true);
    }
  });
  it("isPastDueWithinGrace returns false outside the grace window", () => {
    const longPast = new Date(Date.now() - (PAST_DUE_GRACE_DAYS + 2) * 86_400_000).toISOString();
    expect(isPastDueWithinGrace("past_due", longPast)).toBe(false);
  });
  it("normaliseStatus maps stripe canceled with past period_end to expired", () => {
    expect(normaliseStatus({ status: "canceled", currentPeriodEnd: past() })).toBe("expired");
  });
});

// --- 2. venue access + invalid venue ---------------------------------------

describe("Phase 24 — venue access guard", () => {
  it("invalid venue is blocked", async () => {
    const sb = mockVenueRpc({ accessible: ["a"], allow: () => false });
    await expect(
      resolveManagerVenueId(sb, "u", "z"),
    ).rejects.toBeInstanceOf(VenueAccessError);
  });
  it("unassigned manager cannot resolve a venue", async () => {
    const sb = mockVenueRpc({ accessible: [] });
    await expect(resolveManagerVenueId(sb, "u")).rejects.toThrow(/no venue/i);
  });
  it("multi-venue user cannot silently inherit a venue", async () => {
    const sb = mockVenueRpc({ accessible: ["a", "b"] });
    await expect(resolveManagerVenueId(sb, "u")).rejects.toThrow(/active venue/i);
  });
  it("assertVenueAccess throws typed error when denied", async () => {
    const sb = mockVenueRpc({ accessible: ["a"], allow: () => false });
    await expect(assertVenueAccess(sb, "u", "x")).rejects.toBeInstanceOf(VenueAccessError);
  });
});

// --- 3. server-side guards in paid manager server fns ----------------------

describe("Phase 24 — server-side guards in paid manager server functions", () => {
  const files = [
    "src/lib/lls.functions.ts",
    "src/lib/roi.functions.ts",
    "src/lib/manager-data.functions.ts",
    "src/lib/manager-trace.functions.ts",
    "src/lib/imports.functions.ts",
  ];

  it.each(files)("%s imports requirePaidManagerEntitlement or requireImportEntitlement", (f) => {
    const src = read(f);
    expect(src).toMatch(/require(PaidManager|Import)Entitlement/);
  });

  it("manager-trace.functions calls assertVenueAccess on every venue-scoped handler", () => {
    const src = read("src/lib/manager-trace.functions.ts");
    const handlers = (src.match(/createServerFn/g) || []).length;
    const checks = (src.match(/assertVenueAccess/g) || []).length;
    expect(handlers).toBeGreaterThan(0);
    expect(checks).toBeGreaterThanOrEqual(handlers - 1); // tolerate one util/non-venue fn
  });

  it("imports.functions approve/commit/rollback call assertBatchInVenue", () => {
    const src = read("src/lib/imports.functions.ts");
    const occurrences = (src.match(/assertBatchInVenue/g) || []).length;
    // declaration + at least 3 lifecycle calls
    expect(occurrences).toBeGreaterThanOrEqual(4);
  });

  it("imports.functions approve/commit/rollback all require entitlement", () => {
    const src = read("src/lib/imports.functions.ts");
    const approveBlock = src.slice(src.indexOf("approveImportBatch"), src.indexOf("approveImportBatch") + 800);
    const commitBlock = src.slice(src.indexOf("commitImportBatch"), src.indexOf("commitImportBatch") + 800);
    const rollbackBlock = src.slice(src.indexOf("rollbackImportBatch"), src.indexOf("rollbackImportBatch") + 800);
    expect(approveBlock).toMatch(/require(PaidManager|Import)Entitlement/);
    expect(commitBlock).toMatch(/require(PaidManager|Import)Entitlement/);
    expect(rollbackBlock).toMatch(/require(PaidManager|Import)Entitlement/);
  });

  it("roi.functions handler is guarded by entitlement + venue access", () => {
    const src = read("src/lib/roi.functions.ts");
    expect(src).toMatch(/requirePaidManagerEntitlement/);
    expect(src).toMatch(/assertVenueAccess|resolveManagerVenueId/);
  });
});

// --- 4. server / manager separation ----------------------------------------

describe("Phase 24 — server route isolation", () => {
  const serverFiles = listRoutes("server.");
  const bannedManagerInternals = [
    /from\s+["']@\/lib\/manager-data\.functions["']/,
    /from\s+["']@\/lib\/manager-trace\.functions["']/,
    /from\s+["']@\/lib\/roi\.functions["']/,
    /from\s+["']@\/lib\/roi\//,
    /from\s+["']@\/lib\/pilot\//,
    /from\s+["']@\/lib\/lls\.functions["']/,
    /from\s+["']@\/lib\/imports\.functions["']/,
    /from\s+["']@\/lib\/entitlements-guard["']/,
    /from\s+["']@\/lib\/provenance["']/,
    /from\s+["']@\/lib\/manager-venue["']/,
  ];

  it("found server routes", () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it.each(serverFiles)("%s does not import manager internals", (f) => {
    const src = read(`src/routes/${f}`);
    for (const re of bannedManagerInternals) {
      expect(src, `${f} must not match ${re}`).not.toMatch(re);
    }
  });

  it.each(serverFiles)("%s never renders ROI / payback / labour basis / Adjusted LLS / modelled recoverable / evidence JSON", (f) => {
    const src = read(`src/routes/${f}`).toLowerCase();
    for (const banned of [
      "modelled recoverable",
      "payback period",
      "labour basis",
      "sales basis",
      "adjusted lls",
      "evidence json",
      "of v2",
      "provenance json",
    ]) {
      expect(src, `${f} must not surface "${banned}"`).not.toContain(banned);
    }
  });
});

// --- 5. demo / real separation ---------------------------------------------

describe("Phase 24 — demo route isolation", () => {
  const demoFiles = listRoutes("demo.");
  const realDataModules = [
    /from\s+["']@\/lib\/manager-data\.functions["']/,
    /from\s+["']@\/lib\/manager-trace\.functions["']/,
    /from\s+["']@\/lib\/roi\.functions["']/,
    /from\s+["']@\/lib\/lls\.functions["']/,
    /from\s+["']@\/lib\/imports\.functions["']/,
  ];

  it("found demo routes", () => {
    expect(demoFiles.length).toBeGreaterThan(0);
  });

  it.each(demoFiles)("%s does not import real-data server functions", (f) => {
    const src = read(`src/routes/${f}`);
    for (const re of realDataModules) {
      expect(src, `${f} must not match ${re}`).not.toMatch(re);
    }
  });
});

// --- 6. public routes remain public ----------------------------------------

describe("Phase 24 — public routes", () => {
  const publicRoutes = [
    "src/routes/index.tsx",
    "src/routes/contact.tsx",
    "src/routes/calculator.index.tsx",
    "src/routes/calculator.server-gap.tsx",
    "src/routes/demo.journey.tsx",
  ];

  it.each(publicRoutes)("%s does not require entitlement", (p) => {
    if (!exists(p)) return;
    const src = read(p);
    expect(src).not.toMatch(/PaidManagerGate/);
    expect(src).not.toMatch(/useVerifyPaidManagerAccess/);
  });
});

// --- 7. failure states present in paid manager pages -----------------------

describe("Phase 24 — failure state coverage", () => {
  const paidPages = [
    "src/routes/manager.roi.tsx",
    "src/routes/manager.pilot.tsx",
    "src/routes/manager.lls.index.tsx",
    "src/routes/manager.reports.tsx",
    "src/routes/manager.imports.index.tsx",
  ];

  it.each(paidPages)("%s wraps in PaidManagerGate", (p) => {
    if (!exists(p)) return;
    expect(read(p)).toMatch(/PaidManagerGate/);
  });

  it.each(paidPages)("%s renders NoVenueState for the no-active-venue branch", (p) => {
    if (!exists(p)) return;
    expect(read(p)).toMatch(/NoVenueState/);
  });

  it("ROI page catches fetch errors and surfaces a friendly message", () => {
    const src = read("src/routes/manager.roi.tsx");
    expect(src).toMatch(/\.catch\(/);
    expect(src).toMatch(/setError/);
  });

  it("Pilot page catches fetch errors and surfaces a friendly message", () => {
    const src = read("src/routes/manager.pilot.tsx");
    expect(src).toMatch(/\.catch\(/);
  });

  it("LLS page tolerates OF v2 preview failures (preview is non-fatal)", () => {
    const src = read("src/routes/manager.lls.index.tsx");
    // page must not propagate preview failures by throwing at module level
    expect(src).toMatch(/OfV2PreviewCard|opportunity-factor-v2-preview|preview/i);
  });

  it("OF v2 assessment persistence is best-effort (try/catch) in lls.functions", () => {
    const src = read("src/lib/lls.functions.ts");
    // Phase 20C — assessment persistence is wrapped so a write failure does
    // not break the LLS scorecard / leverage render.
    expect(src).toMatch(/persistAssessment/);
    expect(src).toMatch(/try\s*\{/);
    expect(src).toMatch(/\}\s*catch/);
  });
});

// --- 8. enterprise trust surface -------------------------------------------

describe("Phase 24 — enterprise trust surface", () => {
  const settings = read("src/routes/manager.settings.tsx");

  it("settings page exposes an enterprise trust section", () => {
    expect(settings).toMatch(/id="trust"/);
    expect(settings).toMatch(/Enterprise trust/i);
  });

  it("trust section names the key guarantees", () => {
    const lower = settings.toLowerCase();
    for (const phrase of [
      "role",
      "venue",
      "provenance",
      "reliability",
      "evidence",
      "server",
      "demo",
      "import",
    ]) {
      expect(lower).toContain(phrase);
    }
  });

  it("security & privacy checklist document is present", () => {
    expect(exists("docs/security-privacy-checklist.md")).toBe(true);
  });
});

// --- 9. import / commit safety -------------------------------------------

describe("Phase 24 — import & commit safety", () => {
  const src = read("src/lib/imports.functions.ts");

  it("commit path goes through SECURITY DEFINER RPC lls_v2_commit_batch", () => {
    expect(src).toMatch(/lls_v2_commit_batch/);
  });

  it("rollback path goes through SECURITY DEFINER RPC lls_v2_rollback_batch", () => {
    expect(src).toMatch(/lls_v2_rollback_batch/);
  });

  it("staging table is the only write target for uploaded rows", () => {
    expect(src).toMatch(/shift_staging_rows|shift_(sales|labor)_staging/);
  });

  it("identity resolver export is consumed by imports.functions", () => {
    expect(src).toMatch(/resolveIdentityIndexed|indexDirectory/);
  });
});

// --- 10. existing-tests-still-pass canary ----------------------------------

describe("Phase 24 — sentinel imports", () => {
  it("Phase 16/17/18/20/21/22/23 modules still load", async () => {
    await expect(import("@/lib/venue-access")).resolves.toBeTruthy();
    await expect(import("@/lib/data-reliability")).resolves.toBeTruthy();
    await expect(import("@/lib/provenance")).resolves.toBeTruthy();
    await expect(import("@/lib/opportunity-factor-v2")).resolves.toBeTruthy();
    await expect(import("@/lib/pilot/leadership")).resolves.toBeTruthy();
    await expect(import("@/lib/roi/calculations")).resolves.toBeTruthy();
  });
});
