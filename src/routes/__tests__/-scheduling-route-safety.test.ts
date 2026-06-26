// Route safety — Shift Match Planner.
//
// 1. The scheduling.functions module must enforce paid manager entitlement
//    and venue access (no leakage to non-paid managers or other venues).
// 2. No /server/* route may import the scheduling intelligence module or
//    the engine itself.
// 3. The route file must use PaidManagerGate.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("Shift Match Planner route safety", () => {
  it("scheduling.functions enforces auth + paid entitlement + venue access", () => {
    const src = readFileSync("src/lib/scheduling.functions.ts", "utf8");
    expect(src).toMatch(/requireSupabaseAuth/);
    expect(src).toMatch(/requirePaidManagerEntitlement/);
    expect(src).toMatch(/assertVenueAccess/);
  });

  it("manager.scheduling route wraps the page in PaidManagerGate", () => {
    const src = readFileSync("src/routes/manager.scheduling.tsx", "utf8");
    expect(src).toMatch(/PaidManagerGate/);
    expect(src).toMatch(/useActiveVenue/);
  });

  it("no /server/* route imports scheduling intelligence", () => {
    const files = walk("src/routes").filter((p) => /[\\/]server\./.test(p) || /[\\/]server\.[^/]*\./.test(p));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/scheduling\.functions/);
      expect(src).not.toMatch(/scheduling\/shift-match-planner/);
    }
  });

  it("planner is client-side draft only — no INSERT/UPDATE to scheduling tables", () => {
    const route = readFileSync("src/routes/manager.scheduling.tsx", "utf8");
    const fn = readFileSync("src/lib/scheduling.functions.ts", "utf8");
    expect(route).not.toMatch(/\.from\(["']shifts["']\)\s*\.insert/);
    expect(route).not.toMatch(/\.from\(["']shifts["']\)\s*\.update/);
    expect(fn).not.toMatch(/\.insert\(/);
    expect(fn).not.toMatch(/\.update\(/);
    expect(fn).not.toMatch(/\.delete\(/);
    expect(fn).not.toMatch(/\.upsert\(/);
  });
});
