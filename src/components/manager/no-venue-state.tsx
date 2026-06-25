// Phase 16 — empty state shown when a manager has no accessible venue, or
// when the venue chosen in localStorage no longer exists / is no longer
// accessible. Replaces silent "earliest venue" fallback for multi-site users.
import { Link } from "@tanstack/react-router";

export function NoVenueState({ reason }: { reason?: "none" | "invalid" }) {
  const r = reason ?? "none";
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm">
      <h2 className="text-base font-semibold text-amber-900">
        {r === "invalid" ? "Selected venue is not available" : "No venue selected"}
      </h2>
      <p className="mt-1 text-amber-800">
        {r === "invalid"
          ? "You no longer have access to the venue that was previously selected. Pick an active venue to continue."
          : "Your account isn't linked to a venue yet. Create one or ask an organisation owner to add you."}
      </p>
      <div className="mt-3 flex gap-3">
        <Link to="/manager/settings" className="text-sm font-medium underline text-amber-900">
          Open settings
        </Link>
      </div>
    </div>
  );
}
