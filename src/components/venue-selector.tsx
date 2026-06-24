import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  type ManagerVenue,
  getStoredActiveVenueId,
  listManagerVenues,
  setActiveVenueId,
} from "@/lib/active-venue";

/**
 * Manager venue switcher. Renders nothing when the user belongs to fewer than
 * two venues (no choice to make). Switching persists the active venue and
 * invalidates the router so all queries refetch against the new venue.
 */
export function VenueSelector({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [venues, setVenues] = useState<ManagerVenue[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listManagerVenues();
      if (cancelled) return;
      setVenues(list);
      const stored = getStoredActiveVenueId();
      const valid = stored && list.some((v) => v.id === stored) ? stored : list[0]?.id ?? null;
      setActive(valid);
    })();
    return () => { cancelled = true; };
  }, []);

  if (venues.length < 2) return null;

  return (
    <label className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span className="text-muted-foreground uppercase tracking-widest">Venue</span>
      <select
        value={active ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          setActiveVenueId(id);
          setActive(id);
          router.invalidate();
        }}
        className="rounded-md border border-border bg-white px-2 py-1 text-sm font-medium"
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
    </label>
  );
}
