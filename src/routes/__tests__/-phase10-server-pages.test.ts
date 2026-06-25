// Phase 10 — Server Pages Upgrade.
// Static checks: every server route loads, uses useRoleGate("server"), avoids
// manager-only intelligence (imports + forbidden term scan), and the previously
// stubbed coaching/rewards pages are now real.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = "src/routes";
const SERVER_ROUTES = [
  "server.index.tsx",
  "server.stats.tsx",
  "server.leaderboard.tsx",
  "server.menu.tsx",
  "server.progress.tsx",
  "server.profile.tsx",
  "server.coaching.tsx",
  "server.rewards.tsx",
];

function read(name: string): string {
  return readFileSync(join(ROUTES_DIR, name), "utf8");
}

const FORBIDDEN_TERMS: RegExp[] = [
  /labour cost/i,
  /labor cost/i,
  /adjusted lls/i,
  /opportunity factor/i,
  /recoverable revenue/i,
  /Historical Shift Match Intelligence/,
  /Trading Pattern Factor v1/,
  /\bLLS\b/,
];

const FORBIDDEN_IMPORT_FRAGMENTS: string[] = [
  "@/lib/imports.functions",
  "@/lib/imports/identity",
  "@/lib/imports/validation",
  "@/lib/imports/hash",
  "@/components/manager/operations-status-strip",
  "OperationsStatusStrip",
  "ProvenanceLegend",
  "SchedulingLeverageMatrix",
  "scheduling-leverage-matrix",
  "@/lib/lls.functions",
  "@/lib/lls/v2",
];

describe("Phase 10 — every server route exists and uses the role gate", () => {
  for (const f of SERVER_ROUTES) {
    it(`${f} declares a route and uses useRoleGate("server")`, () => {
      const body = read(f);
      expect(body).toMatch(/createFileRoute\(["']\/server/);
      expect(body).toMatch(/useRoleGate\(["']server["']\)/);
    });
  }
});

describe("Phase 10 — server routes never import manager-only intelligence", () => {
  for (const f of SERVER_ROUTES) {
    it(`${f} has no forbidden manager-only imports`, () => {
      const body = read(f);
      for (const frag of FORBIDDEN_IMPORT_FRAGMENTS) {
        expect(body, `${f} contains forbidden fragment "${frag}"`).not.toContain(frag);
      }
    });
  }
});

describe("Phase 10 — server routes never use forbidden financial wording", () => {
  for (const f of SERVER_ROUTES) {
    it(`${f} has no forbidden financial terms`, () => {
      const body = read(f);
      for (const re of FORBIDDEN_TERMS) {
        expect(body, `${f} matches forbidden term ${re}`).not.toMatch(re);
      }
    });
  }
});

describe("Phase 10 — coaching is no longer a stub", () => {
  const body = read("server.coaching.tsx");
  it("loads approved weekly priorities", () => {
    expect(body).toContain('"weekly_priorities"');
  });
  it("derives a personal focus from performance engine", () => {
    expect(body).toMatch(/loadServerPerformance/);
    expect(body).toMatch(/focus/i);
  });
  it("shows 2-3 practical actions", () => {
    expect(body).toMatch(/FALLBACK_ACTIONS/);
    expect(body).toMatch(/focusActions/);
  });
  it("uses confident, server-friendly wording (no CFO language)", () => {
    expect(body).toMatch(/you've got this/i);
  });
  it("does not contain the old Phase 1A stub copy", () => {
    expect(body).not.toMatch(/wiring this surface up in the next release/);
  });
});

describe("Phase 10 — rewards is no longer a stub", () => {
  const body = read("server.rewards.tsx");
  it("renders badges, streaks and milestones", () => {
    expect(body).toMatch(/badges/);
    expect(body).toMatch(/streak/i);
    expect(body).toMatch(/server_milestones/);
  });
  it("shows a next-unlock card", () => {
    expect(body).toMatch(/next unlock/i);
  });
  it("uses motivational, not financial wording", () => {
    expect(body).toMatch(/wins/i);
    expect(body).not.toMatch(/profit/i);
    expect(body).not.toMatch(/uplift/i);
  });
  it("does not contain the old Phase 1A stub copy", () => {
    expect(body).not.toMatch(/wiring this surface up in the next release/);
  });
});

describe("Phase 10 — leaderboard wording is motivational", () => {
  const body = read("server.leaderboard.tsx");
  it("frames the board as a momentum / winning surface", () => {
    expect(body).toMatch(/who's winning|momentum|most improved/i);
  });
  it("does not label rank as the audit-grade 'best performer'", () => {
    expect(body).not.toMatch(/best performer/i);
  });
});

describe("Phase 10 — server nav only points at canonical server routes", () => {
  const body = readFileSync("src/components/server-layout.tsx", "utf8");
  const navTargets = [...body.matchAll(/to:\s*["'](\/server[^"']*)["']/g)].map((m) => m[1]);
  it("every nav target resolves to an existing server route", () => {
    const routeFiles = new Set(readdirSync(ROUTES_DIR));
    for (const t of navTargets) {
      const fileName = t === "/server"
        ? "server.index.tsx"
        : `server${t.replace(/^\/server/, "").replaceAll("/", ".")}.tsx`;
      expect(routeFiles.has(fileName), `nav points to ${t} but ${fileName} missing`).toBe(true);
    }
  });
});
