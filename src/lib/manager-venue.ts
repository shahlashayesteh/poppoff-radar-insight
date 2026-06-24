// Phase 1A: thin wrapper around active-venue. Kept so existing call sites
// (manager pages) continue to work without churn; new code should import
// from "@/lib/active-venue" directly.
import { getActiveManagerVenue, type ManagerVenue } from "@/lib/active-venue";

export type { ManagerVenue };

export async function getManagerVenue() {
  return getActiveManagerVenue();
}
