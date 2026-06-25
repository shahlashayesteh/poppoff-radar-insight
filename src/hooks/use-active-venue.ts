// Phase 16A — Active venue plumbing for manager pages.
//
// Resolves the active venue id to thread into every guarded paid-manager
// server function. Single-venue managers get their only venue automatically.
// Multi-venue managers must explicitly pick a venue via the <VenueSelector />
// before any venue-scoped data is loaded — we do NOT silently fall back to
// "the first one".
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  getStoredActiveVenueId,
  listManagerVenues,
  setActiveVenueId,
  type ManagerVenue,
} from "@/lib/active-venue";

export type ActiveVenueStatus =
  | "loading"
  | "none"          // user belongs to no venue
  | "select"        // user belongs to >1 venue and has not picked one
  | "ready";        // venueId is safe to use

export type ActiveVenueState = {
  status: ActiveVenueStatus;
  venueId: string | null;
  venues: ManagerVenue[];
};

/**
 * Returns the active venue for the signed-in manager.
 *
 * Re-runs on router invalidation so swapping the active venue from the
 * <VenueSelector /> causes consumers to refetch with the new id.
 */
export function useActiveVenue(): ActiveVenueState {
  // Router invalidation key — VenueSelector triggers router.invalidate()
  // on change so this hook re-resolves the active venue automatically.
  const invKey = useRouterState({
    select: (s) => `${s.location.pathname}::${s.resolvedLocation?.search ?? ""}`,
  });
  const [state, setState] = useState<ActiveVenueState>({
    status: "loading",
    venueId: null,
    venues: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const venues = await listManagerVenues();
        if (cancelled) return;
        if (venues.length === 0) {
          setState({ status: "none", venueId: null, venues });
          return;
        }
        if (venues.length === 1) {
          setActiveVenueId(venues[0].id);
          setState({ status: "ready", venueId: venues[0].id, venues });
          return;
        }
        const stored = getStoredActiveVenueId();
        const match = stored ? venues.find((v) => v.id === stored) : null;
        if (match) {
          setState({ status: "ready", venueId: match.id, venues });
        } else {
          setState({ status: "select", venueId: null, venues });
        }
      } catch {
        if (!cancelled) setState({ status: "none", venueId: null, venues: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [invKey]);

  return state;
}
