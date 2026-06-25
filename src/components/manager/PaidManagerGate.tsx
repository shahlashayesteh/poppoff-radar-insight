// Phase 12A — UI gate for paid manager surfaces.
// Wraps a manager page and blocks rendering when the active subscription
// status does not entitle paid manager intelligence. Active / trialing /
// enterprise pass through. Past_due passes through but with a dunning banner.
// Cancelled / expired / unknown see a clear blocked screen with a link to
// /manager/settings#billing.
//
// This component is manager-only. Do not import it from any /server route.
import { Link } from "@tanstack/react-router";
import { useEntitlement } from "@/lib/entitlements";

export type PaidManagerGateProps = {
  children: React.ReactNode;
  /** Optional feature name for the blocked-screen copy. */
  feature?: string;
};

export function PaidManagerGate({ children, feature = "this feature" }: PaidManagerGateProps) {
  const ent = useEntitlement();

  if (ent.loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground" data-testid="paid-gate-loading">
        Checking subscription…
      </div>
    );
  }

  if (!ent.canAccessPaid) {
    return (
      <div className="mx-auto max-w-2xl p-8" data-testid="paid-gate-blocked">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-2">Subscription required</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Access to {feature} requires an active subscription. Your current
            status is <strong>{ent.status}</strong>.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Reactivate or update your plan from billing to restore access.
            Your existing data is not deleted while your subscription is paused.
          </p>
          <Link
            to="/manager/settings"
            hash="billing"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to billing settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {ent.showPastDueWarning ? (
        <div
          className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900"
          data-testid="paid-gate-past-due-banner"
        >
          Payment past due — please update your billing details to avoid losing
          access.{ent.pastDueGraceDaysRemaining !== null ? (
            <> You have <strong>{ent.pastDueGraceDaysRemaining}</strong> day{ent.pastDueGraceDaysRemaining === 1 ? "" : "s"} of grace remaining.</>
          ) : null}{" "}
          <Link to="/manager/settings" hash="billing" className="underline font-medium">
            Manage billing
          </Link>
        </div>
      ) : null}
      {children}
    </>

  );
}
