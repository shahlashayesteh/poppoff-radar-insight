// Phase 16 — Tenant, Organisation & Multi-Venue Architecture.
//
// Server-side venue resolution helper used by every guarded manager server
// function. Replaces the legacy "earliest venue" fallback with explicit,
// membership-validated active-venue plumbing while preserving compatibility
// for legacy single-venue accounts.
//
// Resolution order:
//   1. If the caller passed an explicit `requestedVenueId`, validate the user
//      can access it (owner, venue_member, or organisation head_office/owner).
//      Throws on failure — silent fall-through is what the multi-site phase
//      is meant to eliminate.
//   2. Otherwise, return the user's only accessible venue.
//   3. If the user has multiple venues and did not request one, throw — the
//      client MUST send the active venue id. This protects head-office and
//      multi-site operators from cross-venue data leakage.
//   4. Throw a clear "no venue assigned" error when the user has none.

export class VenueAccessError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Supabase client typings vary between the user-scoped client (typed RPC
// union) and the publishable client (untyped). Accept `any` here so callers
// pass either without casting; runtime shape is identical.
type SupabaseLike = any;


export async function listAccessibleVenueIds(supabase: SupabaseLike): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_my_accessible_venues");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function assertVenueAccess(
  supabase: SupabaseLike,
  userId: string,
  venueId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("user_can_access_venue", {
    _user_id: userId,
    _venue_id: venueId,
  });
  if (error) throw new VenueAccessError("access_check_failed", error.message);
  if (data !== true) {
    throw new VenueAccessError(
      "venue_access_denied",
      "You do not have access to the requested venue.",
    );
  }
}

/**
 * Resolve the venue id that a manager-side server function should operate on.
 *
 * - When `requestedVenueId` is supplied: validate and return it. This is the
 *   only safe path for multi-venue managers, head office users and any
 *   organisation with more than one site.
 * - When omitted and the caller has exactly one accessible venue: return it
 *   (legacy single-venue compatibility).
 * - When omitted and the caller has multiple: refuse with a typed error so
 *   the UI prompts the user to pick an active venue rather than silently
 *   landing on the wrong one.
 */
export async function resolveManagerVenueId(
  supabase: SupabaseLike,
  userId: string,
  requestedVenueId?: string | null,
): Promise<string> {
  if (requestedVenueId) {
    await assertVenueAccess(supabase, userId, requestedVenueId);
    return requestedVenueId;
  }

  // Legacy compatibility: try owner-only deterministic resolution first so
  // single-venue accounts that never call `get_my_accessible_venues` keep
  // working unchanged.
  const accessible = await listAccessibleVenueIds(supabase);
  if (accessible.length === 0) {
    throw new VenueAccessError(
      "no_venue_assigned",
      "No venue is assigned to your account.",
    );
  }
  if (accessible.length > 1) {
    throw new VenueAccessError(
      "active_venue_required",
      "Multiple venues are available — select an active venue.",
    );
  }
  return accessible[0];
}
