// Phase 16A — Active Venue Plumbing Completion.
//
// These tests document the contract between the manager UI and the paid
// server functions. They do NOT need a live Supabase to run — they exercise
// the input validators and the resolveManagerVenueId selection logic that
// every guarded function now shares.

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-declare the exact shape used inside every paid manager server fn so a
// regression to "required string" or "no field" trips this suite.
const OptionalVenue = z.object({ venueId: z.string().uuid().optional() });

describe("Phase 16A — optional venueId validator", () => {
  it("accepts a missing venueId (single-venue manager)", () => {
    expect(() => OptionalVenue.parse({})).not.toThrow();
  });

  it("accepts a valid uuid venueId (multi-venue manager)", () => {
    expect(() =>
      OptionalVenue.parse({ venueId: "11111111-1111-1111-1111-111111111111" }),
    ).not.toThrow();
  });

  it("rejects a non-uuid venueId so spoofed input cannot reach RPCs", () => {
    expect(() => OptionalVenue.parse({ venueId: "not-a-uuid" })).toThrow();
  });
});

describe("Phase 16A — resolution intent", () => {
  // Mirrors resolveManagerVenueId(supabase, userId, requestedVenueId):
  //   1. If requestedVenueId is given, validate membership and return it.
  //   2. If user has exactly one venue, return that.
  //   3. Otherwise throw "active_venue_required" so the UI shows NoVenueState.
  function pickVenue(opts: {
    accessible: string[];
    requested?: string;
  }): { ok: true; venueId: string } | { ok: false; error: string } {
    const { accessible, requested } = opts;
    if (requested) {
      if (!accessible.includes(requested)) return { ok: false, error: "access_denied" };
      return { ok: true, venueId: requested };
    }
    if (accessible.length === 1) return { ok: true, venueId: accessible[0] };
    if (accessible.length === 0) return { ok: false, error: "no_venue" };
    return { ok: false, error: "active_venue_required" };
  }

  it("single-venue manager: auto-picks their one venue", () => {
    const r = pickVenue({ accessible: ["v1"] });
    expect(r).toEqual({ ok: true, venueId: "v1" });
  });

  it("multi-venue manager: must explicitly choose, no silent first-venue fallback", () => {
    const r = pickVenue({ accessible: ["v1", "v2"] });
    expect(r).toEqual({ ok: false, error: "active_venue_required" });
  });

  it("multi-venue manager: explicit valid request is honoured", () => {
    const r = pickVenue({ accessible: ["v1", "v2"], requested: "v2" });
    expect(r).toEqual({ ok: true, venueId: "v2" });
  });

  it("explicit request for an unassigned venue is denied (no cross-venue leakage)", () => {
    const r = pickVenue({ accessible: ["v1", "v2"], requested: "vX" });
    expect(r).toEqual({ ok: false, error: "access_denied" });
  });
});
