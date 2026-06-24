import { describe, expect, it } from "vitest";
import { dateKey } from "../parse";

describe("dateKey — DD/MM disambiguation (emergency fix)", () => {
  it("parses unambiguous DD/MM/YYYY (day > 12)", () => {
    expect(dateKey("25/03/2026")).toBe("2026-03-25");
    expect(dateKey("31-12-2025")).toBe("2025-12-31");
  });

  it("parses unambiguous MM/DD/YYYY when 2nd segment > 12", () => {
    // 03/25/2026 is unambiguously MM/DD because 25 cannot be a month.
    expect(dateKey("03/25/2026")).toBe("2026-03-25");
  });

  it("defaults UK DD/MM when both segments are ≤ 12", () => {
    // Bug pre-fix: 05/04/2026 was being read with month=4, day=4 (copy-paste).
    // After fix: 05/04/2026 → 2026-04-05 (5 April, UK default).
    expect(dateKey("05/04/2026")).toBe("2026-04-05");
    expect(dateKey("12/12/2026")).toBe("2026-12-12");
    expect(dateKey("01/02/2026")).toBe("2026-02-01");
  });

  it("parses ISO YYYY-MM-DD unchanged", () => {
    expect(dateKey("2026-06-24")).toBe("2026-06-24");
  });

  it("rejects clearly invalid dates", () => {
    expect(dateKey("32/13/2026")).toBeNull();
    expect(dateKey("")).toBeNull();
    expect(dateKey(null)).toBeNull();
  });

  it("handles 2-digit years", () => {
    expect(dateKey("05/04/26")).toBe("2026-04-05");
  });
});
