// LLS v2 — manager admin server functions (feature flag, overrides, diagnostics).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FlagSchema = z.object({
  venue_id: z.string().uuid(),
  active_model_version: z.enum(["v1", "v2"]).optional(),
  compare_mode: z.boolean().optional(),
  baseline_weeks: z.union([z.literal(4), z.literal(8), z.literal(12)]).optional(),
});

export const v2GetVenueFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venue_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("venues")
      .select("lls_active_model_version, lls_compare_mode, lls_v2_baseline_weeks")
      .eq("id", data.venue_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const v2SetVenueFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof FlagSchema>) => FlagSchema.parse(d))
  .handler(async ({ data, context }) => {
    const patch: {
      lls_active_model_version?: "v1" | "v2";
      lls_compare_mode?: boolean;
      lls_v2_baseline_weeks?: number;
    } = {};
    if (data.active_model_version) patch.lls_active_model_version = data.active_model_version;
    if (data.compare_mode != null) patch.lls_compare_mode = data.compare_mode;
    if (data.baseline_weeks) patch.lls_v2_baseline_weeks = data.baseline_weeks;
    const { error } = await context.supabase.from("venues").update(patch).eq("id", data.venue_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ResolveIdentitySchema = z.object({
  staging_row_id: z.string().uuid(),
  decision: z.object({
    action: z.enum(["confirm", "reject", "create"]),
    canonical_identity_id: z.string().uuid().optional(),
    method: z.string().optional(),
    confidence: z.number().optional(),
  }),
});

export const v2ResolveIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ResolveIdentitySchema>) => ResolveIdentitySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lls_v2_resolve_identity", {
      _staging_row_id: data.staging_row_id,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ResolveDuplicateSchema = z.object({
  staging_row_id: z.string().uuid(),
  decision: z.enum(["confirmed_duplicate", "confirmed_distinct"]),
});

export const v2ResolveDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ResolveDuplicateSchema>) => ResolveDuplicateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lls_v2_resolve_duplicate", {
      _staging_row_id: data.staging_row_id,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SingleSidedSchema = z.object({
  staging_row_id: z.string().uuid(),
  justification: z.string().min(1),
});

export const v2AuthoriseSingleSided = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof SingleSidedSchema>) => SingleSidedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lls_v2_authorise_single_sided", {
      _staging_row_id: data.staging_row_id,
      _justification: data.justification,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const v2GetDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venue_id: string; batch_id?: string }) => d)
  .handler(async ({ data, context }) => {
    const q = context.supabase
      .from("shift_staging_rows")
      .select("id, source_kind, reconciliation_status, status_reason, service_date, batch_id")
      .eq("venue_id", data.venue_id);
    const { data: rows, error } = data.batch_id ? await q.eq("batch_id", data.batch_id) : await q;
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) counts[r.reconciliation_status] = (counts[r.reconciliation_status] ?? 0) + 1;
    return { counts, rows: rows ?? [] };
  });
