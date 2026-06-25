// Phase 14 — Server-side entitlement parity for paid manager surfaces.
//
// These server functions wrap the previously direct client-side RLS reads
// used by /manager/menu, /manager/priorities, /manager/coaching and
// /manager/team. Each one is guarded by requirePaidManagerEntitlement so
// that cancelled / expired / unknown / past_due-beyond-grace users cannot
// reach the data even if the UI gate is bypassed.
//
// Reads run as the user (RLS still applies) via requireSupabaseAuth.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";

/**
 * Lightweight verification endpoint. Returns "ok" if the caller is entitled,
 * otherwise throws. Called once on mount by paid manager pages so that the
 * gate is enforced at the network boundary, not only by the client gate.
 */
export const verifyPaidManagerAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    return { ok: true as const };
  });

// ---------- Menu ----------

const VenueInput = z.object({ venueId: z.string().min(1) });

export const listMenuSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueInput>) => VenueInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("menu_item_suggestions")
      .select("id,item_name,category,price,margin,ai_reason,status,source_file,rejected_reason")
      .eq("venue_id", data.venueId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const listVenueMenus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueInput>) => VenueInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("venue_menu")
      .select("id, menu_text, parsed_items, uploaded_at")
      .eq("venue_id", data.venueId)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------- Weekly priorities ----------

const PrioritiesInput = z.object({
  venueId: z.string().min(1),
  weekStart: z.string().nullable().optional(),
});

export const listWeeklyPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof PrioritiesInput>) => PrioritiesInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    let query = context.supabase
      .from("weekly_priorities")
      .select("*")
      .eq("venue_id", data.venueId);
    if (data.weekStart) query = query.eq("week_start", data.weekStart);
    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------- Coaching workflow ----------

export const listCoachingPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof VenueInput>) => VenueInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("weekly_priorities")
      .select(
        "id,item_name,title,category,priority_flag,status,reason,expected_behaviour,expected_impact,expected_impact_basis",
      )
      .eq("venue_id", data.venueId)
      .in("status", ["ai_suggested", "approved", "sent_to_servers"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------- Team analytics ----------

const TeamInput = z.object({
  venueId: z.string().min(1),
  weekStart: z.string().min(1),
});

export const getTeamAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof TeamInput>) => TeamInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePaidManagerEntitlement(context.supabase, context.userId);
    const { supabase } = context;

    const { data: vm } = await supabase
      .from("venue_members")
      .select("user_id")
      .eq("venue_id", data.venueId);
    const ids = (vm ?? []).map((x: any) => x.user_id);

    let members: Array<{ id: string; full_name: string | null }> = [];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      members = (profs ?? []) as any;
    }

    const { data: stats } = await supabase
      .from("server_stats")
      .select("*")
      .eq("venue_id", data.venueId)
      .eq("week_start", data.weekStart);

    return { members, stats: stats ?? [] };
  });
