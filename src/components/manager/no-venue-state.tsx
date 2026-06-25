// Phase 16 / 16A — empty state shown when a manager has no accessible venue,
// when the previously selected venue is no longer accessible, or when a
// multi-venue manager hasn't yet chosen an active venue.
import { Link } from "@tanstack/react-router";
import type { ActiveVenueStatus } from "@/hooks/use-active-venue";
import type { ManagerVenue } from "@/lib/active-venue";

type Props = {
  /** Legacy 2-state reason. */
  reason?: "none" | "invalid";
  /** Phase 16A — pass the live status from useActiveVenue(). */
  status?: ActiveVenueStatus;
  /** Optional list to display when the user must pick one. */
  venues?: ManagerVenue[];
};

export function NoVenueState({ reason, status, venues }: Props) {
  // Derive a single "kind" from whichever input the caller gave us.
  const kind: "none" | "invalid" | "select" | "loading" =
    status === "loading"
      ? "loading"
      : status === "select"
        ? "select"
        : status === "none"
          ? "none"
          : (reason ?? "none");

  if (kind === "loading") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        Loading venue context…
      </div>
    );
  }

  if (kind === "select") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm">
        <h2 className="text-base font-semibold text-amber-900">Select an active venue</h2>
        <p className="mt-1 text-amber-800">
          You have access to multiple venues. Choose one from the venue switcher in the top
          navigation to view venue-specific data.
        </p>
        {venues && venues.length > 0 ? (
          <ul className="mt-3 list-disc pl-5 text-amber-900">
            {venues.map((v) => (
              <li key={v.id}>{v.name}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm">
      <h2 className="text-base font-semibold text-amber-900">
        {kind === "invalid" ? "Selected venue is not available" : "No venue selected"}
      </h2>
      <p className="mt-1 text-amber-800">
        {kind === "invalid"
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
