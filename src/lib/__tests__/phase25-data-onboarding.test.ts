// Phase 25 — Data Onboarding & Export Templates tests.
//
// Covers:
//   - Required / optional / contextual field separation
//   - Section / rota / reservation labelled context only
//   - Template definitions exist for POS, labour and menu/category
//   - Readiness scoring transitions (strong / warning / context only / insufficient)
//   - Import mapping help labels measured + contextual correctly
//   - Manager route is paid-manager + venue gated
//   - Server fn enforces requirePaidManagerEntitlement + assertVenueAccess
//   - Server routes do not import onboarding internals
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  CONTEXTUAL_FIELDS,
  ALL_ONBOARDING_FIELDS,
  TEMPLATES,
  SOURCE_SYSTEM_GUIDE,
  IMPORT_MAPPING_HELP,
  evaluateReadiness,
  templateToCsv,
  type ReadinessSignals,
} from "@/lib/onboarding/data-onboarding";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const ALL_TRUE: ReadinessSignals = {
  hasServerIdentity: true,
  hasSalesByServer: true,
  hasTimestamps: true,
  hasLabourHours: true,
  hasKnownSalesBasis: true,
  hasKnownLabourBasis: true,
  hasItemOrCategory: true,
  sectionsVerified: true,
  onlyRotaOrReservation: false,
};

describe("Phase 25 — field tier separation", () => {
  it("required fields include POS basics", () => {
    const keys = REQUIRED_FIELDS.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining([
      "server_employee_id",
      "check_total",
      "check_timestamp",
      "venue_id",
    ]));
  });

  it("required fields include labour hours", () => {
    expect(REQUIRED_FIELDS.map((f) => f.key)).toContain("labour_hours");
  });

  it("optional fields are not required", () => {
    for (const f of OPTIONAL_FIELDS) expect(f.tier).toBe("optional");
    const reqKeys = new Set(REQUIRED_FIELDS.map((f) => f.key));
    for (const f of OPTIONAL_FIELDS) expect(reqKeys.has(f.key)).toBe(false);
  });

  it("section, rota, and reservation data are labelled contextual and not scoring inputs", () => {
    const ids = new Map(CONTEXTUAL_FIELDS.map((f) => [f.key, f]));
    for (const k of [
      "sevenrooms_section",
      "rota_section",
      "table_allocation",
      "booking_type",
      "walkin_vs_booking",
    ]) {
      const f = ids.get(k);
      expect(f, `expected contextual field ${k}`).toBeTruthy();
      expect(f!.tier).toBe("contextual");
      expect(f!.reliability).toBe("contextual");
      expect(f!.feedsScoring).toBe(false);
    }
  });

  it("no field appears in more than one tier", () => {
    const seen = new Set<string>();
    for (const f of ALL_ONBOARDING_FIELDS) {
      expect(seen.has(f.key), `duplicate key ${f.key}`).toBe(false);
      seen.add(f.key);
    }
  });
});

describe("Phase 25 — export templates", () => {
  const ids = TEMPLATES.map((t) => t.id);
  it("includes POS sales", () => expect(ids).toContain("pos_sales"));
  it("includes labour hours", () => expect(ids).toContain("labour_hours"));
  it("includes menu/category", () => expect(ids).toContain("menu_category"));

  it("each template's CSV starts with its declared columns", () => {
    for (const t of TEMPLATES) {
      const csv = templateToCsv(t);
      const header = csv.split("\n")[0].split(",");
      expect(header).toEqual(t.columns.map((c) => c.name));
    }
  });

  it("rota template is optional and exposes contextual columns", () => {
    const rota = TEMPLATES.find((t) => t.id === "rota_context")!;
    expect(rota.required).toBe(false);
    expect(rota.columns.some((c) => c.reliability === "contextual")).toBe(true);
  });
});

describe("Phase 25 — source system guide", () => {
  it("covers POS, labour, rota, reservation, menu", () => {
    const ids = SOURCE_SYSTEM_GUIDE.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      "pos", "labour_timeclock", "rota", "reservation", "menu",
    ]));
  });

  it("reservation system lists section attribution as not-used-for-scoring", () => {
    const r = SOURCE_SYSTEM_GUIDE.find((s) => s.id === "reservation")!;
    const joined = r.notUsedForScoring.join(" ").toLowerCase();
    expect(joined).toMatch(/section/);
  });
});

describe("Phase 25 — readiness scoring", () => {
  it("returns strong when identity, sales, timestamps, hours and sales basis are present", () => {
    expect(evaluateReadiness(ALL_TRUE).level).toBe("strong");
  });

  it("returns warning when labour hours are missing", () => {
    const r = evaluateReadiness({ ...ALL_TRUE, hasLabourHours: false });
    expect(r.level).toBe("warning");
    expect(r.warnings.join(" ").toLowerCase()).toMatch(/labour hours/);
  });

  it("returns warning when sales basis is unknown", () => {
    const r = evaluateReadiness({ ...ALL_TRUE, hasKnownSalesBasis: false });
    expect(r.level).toBe("warning");
    expect(r.warnings.join(" ").toLowerCase()).toMatch(/sales basis/);
  });

  it("returns context_only when only rota or reservation fields are present", () => {
    const r = evaluateReadiness({
      ...ALL_TRUE,
      hasSalesByServer: false,
      hasLabourHours: false,
      onlyRotaOrReservation: true,
    });
    expect(r.level).toBe("context_only");
    expect(r.feedsScoring).toBe(false);
  });

  it("returns insufficient when server identity is missing", () => {
    const r = evaluateReadiness({ ...ALL_TRUE, hasServerIdentity: false });
    expect(r.level).toBe("insufficient");
  });
});

describe("Phase 25 — import mapping help", () => {
  it("labels measured fields correctly", () => {
    const m = IMPORT_MAPPING_HELP.find((h) => h.field === "check_total")!;
    expect(m.reliability).toBe("measured");
    expect(m.feedsScoring).toBe(true);
  });

  it("labels contextual fields correctly and excludes them from scoring", () => {
    const c = IMPORT_MAPPING_HELP.find((h) => h.field === "sevenrooms_section")!;
    expect(c.reliability).toBe("contextual");
    expect(c.feedsScoring).toBe(false);
  });

  it("labels untrusted fields as not-for-scoring", () => {
    const u = IMPORT_MAPPING_HELP.find((h) => h.field === "manager_free_text")!;
    expect(u.reliability).toBe("untrusted");
    expect(u.feedsScoring).toBe(false);
  });
});

describe("Phase 25 — route guards and server-fn safety", () => {
  const route = read("src/routes/manager.data-onboarding.tsx");
  const fn = read("src/lib/onboarding.functions.ts");

  it("manager onboarding route is wrapped in PaidManagerGate", () => {
    expect(route).toMatch(/PaidManagerGate/);
  });

  it("manager onboarding route requires venue selection via useActiveVenue + NoVenueState", () => {
    expect(route).toMatch(/useActiveVenue/);
    expect(route).toMatch(/NoVenueState/);
  });

  it("manager onboarding route verifies paid manager access on the server", () => {
    expect(route).toMatch(/useVerifyPaidManagerAccess/);
  });

  it("server fn requires paid manager entitlement and venue access", () => {
    expect(fn).toMatch(/requirePaidManagerEntitlement/);
    expect(fn).toMatch(/assertVenueAccess/);
    expect(fn).toMatch(/requireSupabaseAuth/);
  });
});

describe("Phase 25 — server-route isolation", () => {
  const banned = [
    /from\s+["']@\/lib\/onboarding\//,
    /from\s+["']@\/lib\/onboarding\.functions["']/,
    /from\s+["']@\/lib\/manager-data\.functions["']/,
    /from\s+["']@\/lib\/roi/,
    /from\s+["']@\/lib\/entitlements-guard["']/,
    /from\s+["']@\/lib\/data-reliability["']/,
    /from\s+["']@\/lib\/provenance["']/,
  ];
  const files = readdirSync("src/routes").filter(
    (f) => f.startsWith("server.") && f.endsWith(".tsx"),
  );

  it("there are server routes to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no /server/* route imports onboarding or manager intelligence internals", () => {
    for (const f of files) {
      const src = read(`src/routes/${f}`);
      for (const re of banned) {
        expect(src, `server route ${f} must not match ${re}`).not.toMatch(re);
      }
    }
  });
});
