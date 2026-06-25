// Phase 16 — Tenant / multi-venue architecture tests.
//
// Validates:
//  - resolveManagerVenueId honours an explicit requestedVenueId after the
//    access-check RPC returns true
//  - resolveManagerVenueId throws when the access-check RPC denies
//  - resolveManagerVenueId returns the user's only accessible venue when no
//    explicit id is requested (single-venue legacy compatibility)
//  - resolveManagerVenueId refuses to silently pick a venue when the user has
//    multiple accessible venues and no active venue id was supplied
//  - assertVenueAccess raises the typed error class on denial
//
// These are pure unit tests over the helper; the underlying RPCs are mocked
// so the suite stays deterministic and offline.

import { describe, it, expect } from "vitest";
import {
  resolveManagerVenueId,
  assertVenueAccess,
  VenueAccessError,
} from "@/lib/venue-access";

function mockSupabase(opts: {
  accessible: string[];
  allow?: (venueId: string) => boolean;
}) {
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
    from: () => ({}),
  };
}

describe("Phase 16 — venue access resolver", () => {
  it("uses the requested venue when access is granted", async () => {
    const sb = mockSupabase({ accessible: ["a", "b"], allow: () => true });
    const v = await resolveManagerVenueId(sb, "user-1", "b");
    expect(v).toBe("b");
  });

  it("throws VenueAccessError when access is denied", async () => {
    const sb = mockSupabase({ accessible: ["a"], allow: () => false });
    await expect(resolveManagerVenueId(sb, "user-1", "b")).rejects.toBeInstanceOf(
      VenueAccessError,
    );
  });

  it("returns the only accessible venue for single-venue accounts", async () => {
    const sb = mockSupabase({ accessible: ["only"] });
    const v = await resolveManagerVenueId(sb, "user-1");
    expect(v).toBe("only");
  });

  it("refuses to silently pick for multi-venue users", async () => {
    const sb = mockSupabase({ accessible: ["a", "b"] });
    await expect(resolveManagerVenueId(sb, "user-1")).rejects.toMatchObject({
      code: "active_venue_required",
    });
  });

  it("raises a typed no_venue_assigned error when there are zero venues", async () => {
    const sb = mockSupabase({ accessible: [] });
    await expect(resolveManagerVenueId(sb, "user-1")).rejects.toMatchObject({
      code: "no_venue_assigned",
    });
  });

  it("assertVenueAccess throws on denial and resolves on allow", async () => {
    const allow = mockSupabase({ accessible: [], allow: () => true });
    await expect(assertVenueAccess(allow, "u", "v")).resolves.toBeUndefined();
    const deny = mockSupabase({ accessible: [], allow: () => false });
    await expect(assertVenueAccess(deny, "u", "v")).rejects.toBeInstanceOf(VenueAccessError);
  });
});
