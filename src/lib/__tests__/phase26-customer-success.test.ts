// Phase 26 — Customer Success and Adoption Layer tests.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ADOPTION_CHECKLIST,
  ADOPTION_CHECKLIST_IDS,
  WEEKLY_REVIEW_RHYTHM,
  CUSTOMER_SUCCESS_PRINCIPLES,
  PILOT_NOTES_PROMPTS,
  LEADERSHIP_HANDOFF_LINKS,
  buildAdoptionIndicators,
} from "@/lib/adoption/customer-success";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Phase 26 — adoption checklist contents", () => {
  it("includes upload data", () => {
    expect(ADOPTION_CHECKLIST_IDS).toContain("upload_data");
  });
  it("includes data quality review", () => {
    expect(ADOPTION_CHECKLIST_IDS).toContain("review_data_quality");
  });
  it("includes priorities", () => {
    expect(ADOPTION_CHECKLIST_IDS).toContain("set_priorities");
  });
  it("includes coaching review", () => {
    expect(ADOPTION_CHECKLIST_IDS).toContain("review_coaching");
  });
  it("includes ROI / leadership summary path", () => {
    expect(ADOPTION_CHECKLIST_IDS).toEqual(
      expect.arrayContaining(["review_roi_pilot", "leadership_summary"]),
    );
  });
  it("includes weekly review and pilot notes", () => {
    expect(ADOPTION_CHECKLIST_IDS).toEqual(
      expect.arrayContaining(["weekly_review", "pilot_notes", "server_engagement"]),
    );
  });
  it("every checklist item points at a manager-side route, never /server/*", () => {
    for (const g of ADOPTION_CHECKLIST) {
      for (const i of g.items) {
        expect(i.href.startsWith("/manager")).toBe(true);
        expect(i.href.startsWith("/server")).toBe(false);
      }
    }
  });
});

describe("Phase 26 — weekly review rhythm", () => {
  it("has a Monday → end-of-week cadence", () => {
    const days = WEEKLY_REVIEW_RHYTHM.map((s) => s.day);
    expect(days).toEqual(["Monday", "Tuesday", "Midweek", "Weekend", "End of week"]);
  });
  it("end of week step references the leadership summary", () => {
    const last = WEEKLY_REVIEW_RHYTHM[WEEKLY_REVIEW_RHYTHM.length - 1];
    expect(last.action.toLowerCase()).toMatch(/leadership|summary/);
  });
});

describe("Phase 26 — customer success language", () => {
  it("includes coaching not punishment", () => {
    expect(CUSTOMER_SUCCESS_PRINCIPLES).toEqual(
      expect.arrayContaining(["Use this as coaching, not punishment."]),
    );
  });
  it("includes review data quality before reviewing people", () => {
    expect(CUSTOMER_SUCCESS_PRINCIPLES).toEqual(
      expect.arrayContaining(["Review data quality before reviewing people."]),
    );
  });
  it("includes compare like with like", () => {
    expect(CUSTOMER_SUCCESS_PRINCIPLES).toEqual(
      expect.arrayContaining(["Compare like with like."]),
    );
  });
  it("includes measured first, context second", () => {
    expect(CUSTOMER_SUCCESS_PRINCIPLES).toEqual(
      expect.arrayContaining(["Measured data first, context second."]),
    );
  });
});

describe("Phase 26 — pilot notes prompts & leadership handoff", () => {
  it("has the six pilot prompts", () => {
    expect(PILOT_NOTES_PROMPTS.length).toBeGreaterThanOrEqual(6);
    expect(PILOT_NOTES_PROMPTS).toEqual(expect.arrayContaining([
      "What changed this week?",
      "What data quality issue did we find?",
      "Which server behaviour improved?",
      "Which category needs focus?",
      "What should we test next week?",
      "What should leadership know?",
    ]));
  });
  it("leadership handoff links point at ROI, pilot, evidence, onboarding and priorities", () => {
    const labels = LEADERSHIP_HANDOFF_LINKS.map((l) => l.label.toLowerCase());
    expect(labels.join(" ")).toMatch(/roi/);
    expect(labels.join(" ")).toMatch(/pilot/);
    expect(labels.join(" ")).toMatch(/evidence|trace/);
    expect(labels.join(" ")).toMatch(/onboarding/);
    expect(labels.join(" ")).toMatch(/priorit/);
    for (const l of LEADERSHIP_HANDOFF_LINKS) {
      expect(l.href.startsWith("/manager")).toBe(true);
    }
  });
});

describe("Phase 26 — adoption indicators are safe when data is missing", () => {
  it("null signals yields all-missing indicators with safe details", () => {
    const inds = buildAdoptionIndicators(null);
    expect(inds.length).toBeGreaterThanOrEqual(7);
    for (const i of inds) {
      expect(i.status).toBe("missing");
      expect(typeof i.detail).toBe("string");
      expect(i.detail.length).toBeGreaterThan(0);
    }
  });
  it("partial signals only flip the indicators provided", () => {
    const inds = buildAdoptionIndicators({ hasUploadedData: true, prioritiesCreated: true });
    const byId = Object.fromEntries(inds.map((i) => [i.id, i.status]));
    expect(byId.hasUploadedData).toBe("ok");
    expect(byId.prioritiesCreated).toBe("ok");
    expect(byId.coachingVisible).toBe("missing");
    expect(byId.serverActivityVisible).toBe("missing");
  });
});

describe("Phase 26 — route guards and server-fn safety", () => {
  const route = read("src/routes/manager.adoption.tsx");
  const fn = read("src/lib/adoption.functions.ts");

  it("adoption page requires paid manager entitlement", () => {
    expect(route).toMatch(/PaidManagerGate/);
    expect(route).toMatch(/useVerifyPaidManagerAccess/);
  });
  it("adoption page is venue scoped", () => {
    expect(route).toMatch(/useActiveVenue/);
    expect(route).toMatch(/NoVenueState/);
  });
  it("server fn enforces entitlement, venue access and supabase auth", () => {
    expect(fn).toMatch(/requirePaidManagerEntitlement/);
    expect(fn).toMatch(/assertVenueAccess/);
    expect(fn).toMatch(/requireSupabaseAuth/);
  });
});

describe("Phase 26 — server-route isolation", () => {
  const banned: Array<{ name: string; re: RegExp }> = [
    { name: "adoption module", re: /from\s+["']@\/lib\/adoption\// },
    { name: "adoption fn", re: /from\s+["']@\/lib\/adoption\.functions["']/ },
    { name: "manager-data fn", re: /from\s+["']@\/lib\/manager-data\.functions["']/ },
    { name: "roi", re: /from\s+["']@\/lib\/roi/ },
    { name: "entitlements-guard", re: /from\s+["']@\/lib\/entitlements-guard["']/ },
    { name: "data-reliability", re: /from\s+["']@\/lib\/data-reliability["']/ },
    { name: "provenance", re: /from\s+["']@\/lib\/provenance["']/ },
    { name: "manager-trace", re: /from\s+["']@\/lib\/manager-trace/ },
    { name: "lls.functions", re: /from\s+["']@\/lib\/lls\.functions["']/ },
    { name: "opportunity-factor-v2", re: /from\s+["']@\/lib\/opportunity-factor-v2/ },
    { name: "pilot leadership", re: /from\s+["']@\/lib\/pilot\// },
  ];
  const files = readdirSync("src/routes").filter(
    (f) => f.startsWith("server.") && f.endsWith(".tsx"),
  );

  it("there are server routes to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no /server/* route imports adoption or manager intelligence internals", () => {
    for (const f of files) {
      const src = read(`src/routes/${f}`);
      for (const { name, re } of banned) {
        expect(src, `server route ${f} must not import ${name}`).not.toMatch(re);
      }
    }
  });

  it("no /server/* route mentions manager intelligence terms in plain text", () => {
    const forbiddenTerms = [
      /\bAdjusted LLS\b/,
      /\bLabor Leverage Score\b/,
      /\bROI report\b/i,
      /\bmodelled recoverable revenue\b/i,
      /\bevidence trace\b/i,
      /\bprovenance\b/i,
      /\bpayback period\b/i,
    ];
    for (const f of files) {
      const src = read(`src/routes/${f}`);
      for (const term of forbiddenTerms) {
        expect(src, `server route ${f} should not surface ${term}`).not.toMatch(term);
      }
    }
  });
});
