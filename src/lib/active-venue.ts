// Active venue resolution. Replaces ad-hoc first-venue (`limit(1)` / `rows[0]`)
// fallbacks across manager and server pages. Persists the user's chosen venue
// in localStorage and validates it against the user's actual membership on
// every read. Returns null when the user has no venues — callers must handle
// the empty case (show "no venue assigned" UI) instead of crashing.

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "poppoff.activeVenueId";

export type VenueOption = { id: string; name: string };

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function setActiveVenueId(id: string) {
  writeStored(id);
}

export function clearActiveVenueId() {
  writeStored(null);
}

export function getStoredActiveVenueId(): string | null {
  return readStored();
}

/**
 * Resolve the active venue for the given server user.
 *
 * Order:
 *   1. localStorage value, validated against the user's venue_members rows.
 *   2. First venue the user belongs to (alphabetically stable by id).
 *   3. null when the user has no venues.
 *
 * The chosen id is persisted so subsequent reads (and other tabs) stay in sync.
 */
export async function getActiveVenueIdForUser(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("venue_members")
    .select("venue_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("getActiveVenueIdForUser failed", error);
    return null;
  }
  const ids = (data ?? []).map((r) => r.venue_id).filter(Boolean) as string[];
  if (ids.length === 0) {
    writeStored(null);
    return null;
  }
  const stored = readStored();
  if (stored && ids.includes(stored)) return stored;
  const chosen = ids[0];
  writeStored(chosen);
  return chosen;
}

export type ManagerVenue = { id: string; name: string; join_code: string; organisation_id?: string | null; access_source?: string };

/**
 * Resolve the active venue for the signed-in manager.
 *
 * Phase 16: uses `get_my_accessible_venues` which returns every venue the
 * caller can see — owned, member, or via head-office membership in the
 * venue's organisation. Falls back to the legacy `get_my_manager_venue` RPC
 * if the new RPC is unavailable, preserving compatibility with older
 * deployments. Validates the stored localStorage choice against this list
 * before returning, so a manager removed from a venue cannot keep using it.
 */
async function loadAccessibleVenues(): Promise<ManagerVenue[]> {
  const r = await supabase.rpc("get_my_accessible_venues" as never);
  if (!r.error && Array.isArray(r.data)) return r.data as ManagerVenue[];
  // Legacy fallback for single-venue accounts.
  const legacy = await supabase.rpc("get_my_manager_venue" as never);
  if (!legacy.error && Array.isArray(legacy.data)) return legacy.data as ManagerVenue[];
  return [];
}

export async function getActiveManagerVenue(): Promise<ManagerVenue | null> {
  const rows = await loadAccessibleVenues();
  if (rows.length === 0) { writeStored(null); return null; }
  const stored = readStored();
  const match = stored ? rows.find((v) => v.id === stored) : undefined;
  if (match) {
    writeStored(match.id);
    return match;
  }
  // Single-venue users get their only venue auto-selected.
  if (rows.length === 1) {
    writeStored(rows[0].id);
    return rows[0];
  }
  // Phase 16A: multi-venue users MUST explicitly pick. Do NOT silently default
  // to the first venue — that previously created cross-venue data exposure
  // when stored selection was missing. Callers should render <NoVenueState />.
  writeStored(null);
  return null;
}

export async function listManagerVenues(): Promise<ManagerVenue[]> {
  return loadAccessibleVenues();
}

/**
 * True when the caller has access to more than one venue. Used by the UI
 * to decide whether to show the venue selector and the "no venue selected"
 * empty state. Cached briefly via the underlying RPC's HTTP cache.
 */
export async function hasMultipleVenues(): Promise<boolean> {
  return (await loadAccessibleVenues()).length > 1;
}

