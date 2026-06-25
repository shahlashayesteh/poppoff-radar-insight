// Phase 12 — Subscription entitlement helpers.
// Pure logic in this file so it is trivially testable. UI hook and server
// gate are exported alongside but kept thin.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "enterprise"
  | "expired"
  | "unknown";

export type EntitlementInput = {
  status: string | null | undefined;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
};

const STRIPE_TO_INTERNAL: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "cancelled",
  cancelled: "cancelled",
  unpaid: "expired",
  incomplete_expired: "expired",
  incomplete: "unknown",
  paused: "expired",
  enterprise: "enterprise",
};

/** Normalises any provider status (Stripe/internal) into our canonical enum. */
export function normaliseStatus(input: EntitlementInput): SubscriptionStatus {
  const raw = (input.status ?? "").toLowerCase();
  const mapped = STRIPE_TO_INTERNAL[raw] ?? "unknown";
  if (mapped === "cancelled") {
    // Grace period: cancelled with future period_end still counts as cancelled
    // (UI may render "ends on …") — expired only once period has elapsed.
    const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd).getTime() : null;
    if (end !== null && end < Date.now()) return "expired";
  }
  return mapped;
}

/** Can the user access paid manager features (LLS, reports, coaching, imports)? */
export function canAccessPaidManagerFeatures(status: SubscriptionStatus): boolean {
  return status === "active" || status === "enterprise" || status === "trialing";
}

/** Can the user import production data? Blocks cancelled/expired/unknown. */
export function canImportProductionData(status: SubscriptionStatus): boolean {
  return status === "active" || status === "enterprise" || status === "trialing";
}

/** Should we show a dunning banner? */
export function shouldShowPastDueWarning(status: SubscriptionStatus): boolean {
  return status === "past_due";
}

/** Human label for UI surfaces. */
export function statusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case "active": return "Active";
    case "trialing": return "Trial";
    case "past_due": return "Payment past due";
    case "cancelled": return "Cancelled (grace period)";
    case "expired": return "Expired";
    case "enterprise": return "Enterprise";
    default: return "No subscription";
  }
}

export type EntitlementSnapshot = {
  loading: boolean;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  planId: string | null;
  canAccessPaid: boolean;
  canImport: boolean;
  showPastDueWarning: boolean;
};

/** Client hook — reads the latest subscription row for the signed-in user. */
export function useEntitlement(): EntitlementSnapshot {
  const [snap, setSnap] = useState<EntitlementSnapshot>({
    loading: true,
    status: "unknown",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    planId: null,
    canAccessPaid: false,
    canImport: false,
    showPastDueWarning: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        if (!cancelled) setSnap((s) => ({ ...s, loading: false, status: "unknown" }));
        return;
      }
      const { data } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end, price_id")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const status = normaliseStatus({
        status: data?.status,
        currentPeriodEnd: data?.current_period_end ?? null,
        cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
      });
      setSnap({
        loading: false,
        status,
        currentPeriodEnd: data?.current_period_end ?? null,
        cancelAtPeriodEnd: !!data?.cancel_at_period_end,
        planId: data?.price_id ?? null,
        canAccessPaid: canAccessPaidManagerFeatures(status),
        canImport: canImportProductionData(status),
        showPastDueWarning: shouldShowPastDueWarning(status),
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return snap;
}
