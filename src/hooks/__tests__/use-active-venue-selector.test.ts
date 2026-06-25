// Regression test for the manager-wide crash where the useActiveVenue hook
// passed an unsafe selector to useRouterState. The previous selector did
//   `${s.location.pathname}::${s.resolvedLocation?.search ?? ""}`
// which coerced the parsed search-params object to a primitive. For some
// search objects (no string-coercible toString), that throws
// "TypeError: Cannot convert object to primitive value" and crashed every
// paid manager route through the error boundary. This test pins the
// selector to a string-safe shape so the regression cannot return.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("useActiveVenue useRouterState selector", () => {
  const src = readFileSync(
    resolve(__dirname, "../use-active-venue.ts"),
    "utf8",
  );

  it("does not template-stringify resolvedLocation.search", () => {
    expect(src).not.toMatch(/resolvedLocation\?\.search/);
    expect(src).not.toMatch(/\$\{[^}]*\.search[^}]*\}/);
  });

  it("uses a string field (location.href or pathname) as the invalidation key", () => {
    expect(src).toMatch(/select:\s*\(s\)\s*=>\s*s\.location\.(href|pathname)/);
  });
});
