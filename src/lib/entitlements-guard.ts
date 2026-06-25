// Phase 12A — Shared server-side entitlement guard for paid manager features.
// Used by import server functions AND by LLS / reports / menu / coaching /
// priorities / team server functions so that subscription status gates every
// paid manager surface, not just imports.
//
// Pure function: takes the request-scoped supabase client + userId and throws
// a clear error if the caller is not entitled. Importable from any
// *.functions.ts module (no top-level server-only deps).
import { normaliseStatus, canAccessPaidManagerFeatures, canImportProductionData } from "@/lib/entitlements";

export type GuardKind = "paid_manager" | "import";

export async function requirePaidManagerEntitlement(
  supabase: any,
  userId: string,
  kind: GuardKind = "paid_manager",
): Promise<void> {
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

  const ok = kind === "import"
    ? canImportProductionData(status)
    : canAccessPaidManagerFeatures(status);

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
