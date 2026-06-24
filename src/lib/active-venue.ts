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

export type ManagerVenue = { id: string; name: string; join_code: string };

/**
 * Resolve the active venue for the signed-in manager. Uses the existing
 * `get_my_manager_venue` RPC for ownership/role checks, then layers
 * localStorage on top so multi-venue managers stay on their chosen venue.
 */
export async function getActiveManagerVenue(): Promise<ManagerVenue | null> {
  const { data, error } = await supabase.rpc("get_my_manager_venue" as never);
  if (error) {
    console.warn("getActiveManagerVenue failed", error);
    return null;
  }
  const rows = (Array.isArray(data) ? data : []) as ManagerVenue[];
  if (rows.length === 0) {
    writeStored(null);
    return null;
  }
  const stored = readStored();
  const match = stored ? rows.find((v) => v.id === stored) : undefined;
  const chosen = match ?? rows[0];
  writeStored(chosen.id);
  return chosen;
}

/**
 * Load the full list of venues the signed-in manager can switch between.
 * Returns the same shape as getActiveManagerVenue so the selector can render
 * names without a second round-trip.
 */
export async function listManagerVenues(): Promise<ManagerVenue[]> {
  const { data, error } = await supabase.rpc("get_my_manager_venue" as never);
  if (error) return [];
  return (Array.isArray(data) ? data : []) as ManagerVenue[];
}
