// LLS v2 — manager-facing import + reconcile server functions (shadow mode only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidManagerEntitlement } from "@/lib/entitlements-guard";

const IngestSchema = z.object({
  venue_id: z.string().uuid(),
  payload: z.object({
    source_kind: z.enum(["sales", "labor", "combined"]),
    source_filename: z.string().optional(),
    rows: z.array(z.record(z.string(), z.any())).min(1),
  }),
});

export const v2IngestBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof IngestSchema>) => IngestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: batchId, error } = await supabase.rpc("lls_v2_ingest_batch", {
      _venue_id: data.venue_id,
      _payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return { batch_id: batchId as string };
  });

const ReconcileSchema = z.object({ venue_id: z.string().uuid(), batch_id: z.string().uuid() });

export const v2RunReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ReconcileSchema>) => ReconcileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("lls_v2_run_reconciliation", {
      _venue_id: data.venue_id,
      _batch_id: data.batch_id,
    });
    if (error) throw new Error(error.message);
    return { result: JSON.parse(JSON.stringify(res ?? {})) as Record<string, number | string> };
  });

export const v2SupersedeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batch_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lls_v2_supersede_batch", { _batch_id: data.batch_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
