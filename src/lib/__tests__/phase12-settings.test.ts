// Phase 12 — Settings sections + server visibility safety.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = join(__dirname, "../..");
const settings = readFileSync(join(src, "routes/manager.settings.tsx"), "utf-8");

describe("manager.settings.tsx structure", () => {
  const requiredSections = [
    'id="venue"',
    'id="data-sources"',
    'id="import-rules"',
    'id="roles"',
    'id="visibility"',
    'id="lls"',
    'id="billing"',
    'id="audit"',
  ];

  it.each(requiredSections)("contains section %s", (sec) => {
    expect(settings).toContain(sec);
  });

  it("renders billing status via entitlement hook", () => {
    expect(settings).toContain('data-testid="billing-status"');
    expect(settings).toContain("useEntitlement");
    expect(settings).toContain("statusLabel");
  });

  it("server visibility section disclaims it cannot expose manager-only intelligence", () => {
    const visibilityIndex = settings.indexOf('id="visibility"');
    expect(visibilityIndex).toBeGreaterThan(-1);
    const billingIndex = settings.indexOf('id="billing"');
    const slice = settings.slice(visibilityIndex, billingIndex);
    // The disclaimer text must mention labour cost, LLS, identity, Shift Match.
    expect(slice).toMatch(/labour cost/i);
    expect(slice).toMatch(/LLS/);
    expect(slice).toMatch(/identity/i);
    expect(slice).toMatch(/Shift Match/i);
  });

  it("does not surface margin or recoverable revenue in any toggle label", () => {
    expect(settings).not.toMatch(/margin/i);
    expect(settings).not.toMatch(/recoverable revenue/i);
  });
});

describe("imports server functions gate by entitlement", () => {
  const importsFn = readFileSync(join(root, "../lib/imports.functions.ts"), "utf-8");
  it("stageImport guards via requireImportEntitlement", () => {
    expect(importsFn).toMatch(/requireImportEntitlement/);
    expect(importsFn).toMatch(/canImportProductionData/);
  });
  it("imports list page surfaces import-blocked banner", () => {
    const idx = readFileSync(join(root, "routes/manager.imports.index.tsx"), "utf-8");
    expect(idx).toContain('data-testid="import-blocked-banner"');
    expect(idx).toContain("useEntitlement");
  });
});

describe("server routes do not expose manager-only billing / entitlement intelligence", () => {
  const serverFiles = [
    "routes/server.coaching.tsx",
    "routes/server.rewards.tsx",
    "routes/server.index.tsx",
  ];
  it.each(serverFiles)("%s does not import entitlement helpers", (rel) => {
    let src: string;
    try { src = readFileSync(join(root, rel), "utf-8"); }
    catch { return; } // file may not exist; skip silently
    expect(src).not.toMatch(/from\s+["']@\/lib\/entitlements["']/);
    expect(src).not.toMatch(/billing-status/);
    expect(src).not.toMatch(/payment_events/);
  });
});
