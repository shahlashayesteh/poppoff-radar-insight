// Phase 25 — Data onboarding server function.
//
// Read-only. Computes a lightweight data readiness signal for the active
// venue from existing shifts metadata so the onboarding page can show
// operators where they stand. No mutations.
//
// Hard contract:
//   - requirePaidManagerEntitlement + assertVenueAccess on every handler.
//   - Venue-scoped. RLS still applies via requireSupabaseAuth.
//   - /server/* routes MUST NOT import this module.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";
import { assertVenueAccess } from "@/lib/venue-access";
import {
  evaluateReadiness,
  type ReadinessResult,
  type ReadinessSignals,
} from "@/lib/onboarding/data-onboarding";

const VenueInput = z.object({ venueId: z.string().min(1) });

export const getDataReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueInput>) => VenueInput.parse(d))
  .handler(async ({ data, context }): Promise<{
    signals: ReadinessSignals;
    result: ReadinessResult;
    sampleSize: number;
  }> => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    await assertVenueAccess(context.supabase, context.userId, data.venueId);

    const { data: shifts } = await context.supabase
      .from("shifts")
      .select(
        "employee_id, shift_date, gross_sales, labor_cost, clock_hours, scheduled_hours, sales_basis, labor_basis, reliability_class, identity_match_method",
      )
      .eq("venue_id", data.venueId)
      .order("shift_date", { ascending: false })
      .limit(500);

    const rows = shifts ?? [];
    const n = rows.length;

    const hasServerIdentity = rows.some(
      (r: any) => r.employee_id && r.identity_match_method && r.identity_match_method !== "ambiguous",
    );
    const hasSalesByServer = rows.some((r: any) => r.employee_id && Number(r.gross_sales) > 0);
    const hasTimestamps = rows.some((r: any) => r.shift_date);
    const hasLabourHours = rows.some(
      (r: any) => Number(r.clock_hours) > 0 || Number(r.scheduled_hours) > 0,
    );
    const hasKnownSalesBasis = rows.some(
      (r: any) => r.sales_basis && r.sales_basis !== "unknown",
    );
    const hasKnownLabourBasis = rows.some(
      (r: any) => r.labor_basis && r.labor_basis !== "unknown",
    );
    const hasItemOrCategory = rows.some(
      (r: any) => r.reliability_class === "measured" || r.reliability_class === "derived",
    );

    const signals: ReadinessSignals = {
      hasServerIdentity,
      hasSalesByServer,
      hasTimestamps,
      hasLabourHours,
      hasKnownSalesBasis,
      hasKnownLabourBasis,
      hasItemOrCategory,
      // Sections only become verified when an operator explicitly confirms
      // them in settings. Default is false — context only.
      sectionsVerified: false,
      // If we observed no shifts at all, the only useful surface left is
      // rota / reservation. Mark accordingly so evaluateReadiness can give
      // the right "context only" headline.
      onlyRotaOrReservation: n === 0,
    };

    return { signals, result: evaluateReadiness(signals), sampleSize: n };
  });
