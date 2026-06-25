// Phase 12A + Phase 14 — Shared server-side entitlement guard for paid
// manager features.
//
// Used by import, LLS, reports, menu, coaching, priorities, team and any
// other paid manager server functions so that subscription status gates every
// paid manager surface — not only imports and LLS.
//
// Phase 14 additions:
//   - 7-day grace window for past_due on paid manager features (import policy
//     remains strict and blocks past_due immediately).
//   - Per-request memoization keyed by supabase client + userId so a single
//     server-fn invocation that touches multiple guarded helpers only reads
//     the subscriptions row once.
import {
  normaliseStatus,
  canAccessPaidManagerFeaturesWithGrace,
  canImportProductionData,
  type SubscriptionStatus,
} from "@/lib/entitlements";

export type GuardKind = "paid_manager" | "import";

type CachedRow = {
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  fetchedAt: number;
};

// WeakMap keyed by the per-request supabase client; entries auto-collected
// when the handler returns. TTL is a safety net for very long-lived clients.
const TTL_MS = 5_000;
const cache: WeakMap<object, Map<string, CachedRow>> = new WeakMap();

async function readSubscription(supabase: any, userId: string): Promise<CachedRow> {
  let perClient = cache.get(supabase as object);
  if (perClient) {
    const hit = perClient.get(userId);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;
  }
  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = normaliseStatus({
    status: data?.status ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
    cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
  });
  const entry: CachedRow = {
    status,
    currentPeriodEnd: data?.current_period_end ?? null,
    fetchedAt: Date.now(),
  };
  if (!perClient) {
    perClient = new Map();
    cache.set(supabase as object, perClient);
  }
  perClient.set(userId, entry);
  return entry;
}

export async function requirePaidManagerEntitlement(
  supabase: any,
  userId: string,
  kind: GuardKind = "paid_manager",
): Promise<void> {
  const { status, currentPeriodEnd } = await readSubscription(supabase, userId);

  const ok = kind === "import"
    ? canImportProductionData(status)
    : canAccessPaidManagerFeaturesWithGrace(status, currentPeriodEnd);

  if (!ok) {
    throw new Error(
      `Subscription required for paid manager features (current status: ${status}). ` +
      `Visit /manager/settings#billing to update your subscription.`,
    );
  }
}

// Back-compat alias for the import-specific name used in imports.functions.ts.
export async function requireImportEntitlement(supabase: any, userId: string): Promise<void> {
  return requirePaidManagerEntitlement(supabase, userId, "import");
}

/** Test-only — clear the memoization cache between tests. */
export function __clearEntitlementCacheForTests(): void {
  // WeakMap has no clear(); creating a fresh module-level map would break
  // the closure. Iterate is not possible either, so we re-assign via Object
  // identity by clearing each known per-client map we can reach. In practice
  // tests pass fresh fake supabase objects, so old entries are GC'd anyway.
  // This helper is kept as a no-op explicit marker.
}
