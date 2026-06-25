// Phase 26 — Adoption status server function.
//
// Read-only lightweight indicators for /manager/adoption. Each query is
// wrapped in try/catch so missing tables degrade to "missing" rather than
// failing the page. Guarded by paid manager entitlement + venue access.
// MUST NOT be imported by /server/* routes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";
import { assertVenueAccess } from "@/lib/venue-access";
import type { AdoptionSignals } from "@/lib/adoption/customer-success";

const VenueInput = z.object({ venueId: z.string().min(1) });

async function safeCount(
  supabase: any,
  table: string,
  filter: (q: any) => any,
): Promise<number> {
  try {
    const q = supabase.from(table).select("*", { count: "exact", head: true });
    const { count, error } = await filter(q);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export const getAdoptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueInput>) => VenueInput.parse(d))
  .handler(async ({ data, context }): Promise<{
    signals: AdoptionSignals;
    sampleSize: number;
  }> => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const venueId = data.venueId;

    const shiftCount = await safeCount(context.supabase, "shifts", (q: any) =>
      q.eq("venue_id", venueId),
    );

    const prioritiesAll = await safeCount(context.supabase, "weekly_priorities", (q: any) =>
      q.eq("venue_id", venueId),
    );
    const prioritiesVisible = await safeCount(context.supabase, "weekly_priorities", (q: any) =>
      q.eq("venue_id", venueId).eq("status", "sent_to_servers"),
    );

    // Recent server logins as a coarse engagement signal.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentLogins = await safeCount(context.supabase, "server_logins", (q: any) =>
      q.eq("venue_id", venueId).gte("login_at", sevenDaysAgo),
    );

    // Resolved (non-ambiguous) identity rows as a proxy for "data quality reviewed".
    let resolvedShifts = 0;
    try {
      const { count } = await context.supabase
        .from("shifts")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .not("identity_match_method", "is", null)
        .neq("identity_match_method", "ambiguous");
      resolvedShifts = count ?? 0;
    } catch {
      resolvedShifts = 0;
    }

    const signals: AdoptionSignals = {
      hasUploadedData: shiftCount > 0,
      // Heuristic: at least half of shifts have a resolved identity.
      dataQualityReviewed: shiftCount > 0 && resolvedShifts >= Math.ceil(shiftCount / 2),
      prioritiesCreated: prioritiesAll > 0,
      coachingVisible: prioritiesVisible > 0,
      // We cannot observe whether a manager has actually opened ROI / pilot
      // without instrumentation. Treat as visible/ready when the underlying
      // data is present so the indicator reflects "available" rather than
      // "viewed".
      roiViewed: shiftCount > 0,
      pilotSummaryReady: shiftCount > 0,
      serverActivityVisible: recentLogins > 0,
    };

    return { signals, sampleSize: shiftCount };
  });
