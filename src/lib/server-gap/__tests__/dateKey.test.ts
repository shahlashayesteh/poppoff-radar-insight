import { describe, expect, it } from "vitest";
import { dateKey, setDefaultDateFormat, resetAmbiguousDateFlag, lastParseHadAmbiguousDates } from "../parse";

describe("dateKey — DD/MM disambiguation", () => {
  it("parses unambiguous DD/MM/YYYY (day > 12)", () => {
    expect(dateKey("25/03/2026")).toBe("2026-03-25");
    expect(dateKey("31-12-2025")).toBe("2025-12-31");
  });

  it("parses unambiguous MM/DD/YYYY when 2nd segment > 12", () => {
    expect(dateKey("03/25/2026")).toBe("2026-03-25");
  });

  it("defaults UK DD/MM when both segments are ≤ 12", () => {
    setDefaultDateFormat("uk");
    expect(dateKey("05/04/2026")).toBe("2026-04-05");
    expect(dateKey("12/12/2026")).toBe("2026-12-12");
    expect(dateKey("01/02/2026")).toBe("2026-02-01");
  });

  it("parses ISO YYYY-MM-DD unchanged regardless of format", () => {
    expect(dateKey("2026-06-24", "us")).toBe("2026-06-24");
    expect(dateKey("2026-06-24", "uk")).toBe("2026-06-24");
  });

  it("rejects clearly invalid dates", () => {
    expect(dateKey("32/13/2026")).toBeNull();
    expect(dateKey("")).toBeNull();
    expect(dateKey(null)).toBeNull();
  });

  it("handles 2-digit years", () => {
    setDefaultDateFormat("uk");
    expect(dateKey("05/04/26")).toBe("2026-04-05");
  });
});

describe("F2 — date format follows market/selected format", () => {
  it("US format reads ambiguous dates as MM/DD", () => {
    expect(dateKey("05/04/2026", "us")).toBe("2026-05-04"); // May 4
    expect(dateKey("01/02/2026", "us")).toBe("2026-01-02"); // Jan 2
  });

  it("UK format reads ambiguous dates as DD/MM", () => {
    expect(dateKey("05/04/2026", "uk")).toBe("2026-04-05"); // 5 April
    expect(dateKey("01/02/2026", "uk")).toBe("2026-02-01"); // 1 February
  });

  it("global default switches via setDefaultDateFormat", () => {
    setDefaultDateFormat("us");
    expect(dateKey("05/04/2026")).toBe("2026-05-04");
    setDefaultDateFormat("uk");
    expect(dateKey("05/04/2026")).toBe("2026-04-05");
  });

  it("tracks ambiguous-date encounters for UI warning", () => {
    resetAmbiguousDateFlag();
    dateKey("25/03/2026"); // unambiguous → no flag
    expect(lastParseHadAmbiguousDates()).toBe(false);
    dateKey("05/04/2026"); // ambiguous → flag
    expect(lastParseHadAmbiguousDates()).toBe(true);
  });
});

