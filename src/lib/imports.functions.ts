// Phase 6 — Import staging server functions.
// All uploads route through staging first; manager approval is required before
// rows reach public.shifts. Reads RLS-protected; writes go through SECURITY
// DEFINER RPCs (commit/rollback/approve) or scoped inserts under the
// requireSupabaseAuth user context.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateRows, type RawImportRow, type SourceKind } from "@/lib/imports/validation";

// ---- venue resolver (same deterministic policy as lls.functions.ts) ----
async function getManagerVenueId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("venues")
    .select("id, created_at")
    .eq("manager_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string }>;
  if (rows.length === 0) throw new Error("No venue found for this manager");
  return rows[0].id;
}

const RawRowSchema = z
  .object({
    server_name: z.string().nullable().optional(),
    server_id: z.string().nullable().optional(),
    shift_date: z.string().nullable().optional(),
    shift_start_time: z.string().nullable().optional(),
    shift_end_time: z.string().nullable().optional(),
    daypart: z.string().nullable().optional(),
    covers_served: z.number().nullable().optional(),
    gross_sales: z.number().nullable().optional(),
    net_sales: z.number().nullable().optional(),
    labor_cost: z.number().nullable().optional(),
    outlet: z.string().nullable().optional(),
    revenue_centre: z.string().nullable().optional(),
    sales_basis: z.string().nullable().optional(),
    labor_basis: z.string().nullable().optional(),
  })
  .passthrough();

const StageInput = z.object({
  sourceKind: z.enum(["sales", "labor"]),
  filename: z.string().optional(),
  fileHash: z.string().optional(),
  sourceSystem: z.string().optional(),
  rows: z.array(RawRowSchema).min(1).max(20000),
});

export const stageImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof StageInput>) => StageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);

    const sourceKind = data.sourceKind as SourceKind;
    const importType = sourceKind === "sales" ? "sales" : "labour";
    const validation = validateRows(data.rows as RawImportRow[], sourceKind);

    // Create the batch (status = needs_review — manager must approve before commit)
    const { data: batch, error: bErr } = await supabase
      .from("shift_import_batches_v2")
      .insert({
        venue_id: venueId,
        uploaded_by: userId,
        source_kind: sourceKind,
        source_filename: data.filename ?? null,
        source_system: data.sourceSystem ?? null,
        file_hash: data.fileHash ?? null,
        import_type: importType,
        is_active: false, // gates the v2 reconciliation pipeline until approved
        row_count: data.rows.length,
        accepted_count: validation.summary.accepted,
        rejected_count: validation.summary.rejected,
        warning_count: validation.summary.warnings,
        gross_total: validation.totals.gross_total,
        net_total: validation.totals.net_total,
        labour_total: validation.totals.labour_total,
        covers_total: validation.totals.covers_total,
        sales_basis_summary: validation.salesBasis as any,
        labour_basis_summary: validation.labourBasis as any,
        validation_summary: validation.summary as any,
        status: "needs_review",
      })
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);
    const batchId = batch.id as string;

    // Insert staging rows + sales/labor detail in bulk
    const stagingRows: any[] = data.rows.map((r, i) => {
      const v = validation.rows[i];
      const rejected = v.status === "rejected";
      const reportedName = (r.server_name ?? "").toString().trim() || null;
      const reportedId = (r.server_id ?? "").toString().trim() || null;
      const dateValid = r.shift_date && /^\d{4}-\d{2}-\d{2}$/.test(r.shift_date);
      const dupKey = [reportedId ?? reportedName ?? "", r.shift_date ?? "", r.shift_start_time ?? ""].join("|").toLowerCase();
      return {
        venue_id: venueId,
        batch_id: batchId,
        source_kind: sourceKind,
        source_row_index: i,
        raw_row: r as any,
        raw_row_hash: dupKey,
        service_date: dateValid ? r.shift_date : null,
        reported_identity_id: reportedId,
        reported_identity_name: reportedName,
        reconciliation_status: rejected
          ? "excluded_invalid"
          : (v.duplicateOfIndex != null ? "duplicate_pending" : "pending"),
        duplicate_status: v.duplicateOfIndex != null ? "duplicate_candidate" : "unique",
        excluded_from_canonical: rejected,
        status_reason: v.reasons.join(",") || null,
        status_evidence: { reasons: v.reasons, ...(v.evidence as Record<string, unknown>) } as any,
      };
    });

    const { data: insertedStaging, error: sErr } = await supabase
      .from("shift_staging_rows")
      .insert(stagingRows)
      .select("id, source_row_index");
    if (sErr) throw new Error(sErr.message);

    const idByIdx = new Map<number, string>();
    for (const row of insertedStaging ?? []) {
      idByIdx.set((row as any).source_row_index as number, (row as any).id as string);
    }

    if (sourceKind === "sales") {
      const sales = data.rows
        .map((r, i) => ({ r, i, sid: idByIdx.get(i) }))
        .filter((x) => x.sid)
        .map(({ r, sid }) => {
          const startISO = r.shift_date && r.shift_start_time
            ? `${r.shift_date}T${r.shift_start_time.length === 5 ? r.shift_start_time + ":00" : r.shift_start_time}+00:00`
            : null;
          const endISO = r.shift_date && r.shift_end_time
            ? `${r.shift_date}T${r.shift_end_time.length === 5 ? r.shift_end_time + ":00" : r.shift_end_time}+00:00`
            : null;
          return {
            staging_row_id: sid!,
            venue_id: venueId,
            batch_id: batchId,
            sales_employee_shift_start: startISO,
            sales_employee_shift_end: endISO,
            gross_sales: (r.gross_sales as number | null) ?? null,
            net_sales: (r.net_sales as number | null) ?? null,
            covers: (r.covers_served as number | null) ?? null,
          };
        });
      if (sales.length) {
        const { error } = await supabase.from("shift_sales_staging").insert(sales);
        if (error) throw new Error(error.message);
      }
    } else {
      const labor = data.rows
        .map((r, i) => ({ r, i, sid: idByIdx.get(i) }))
        .filter((x) => x.sid)
        .map(({ r, sid }) => {
          const startISO = r.shift_date && r.shift_start_time
            ? `${r.shift_date}T${r.shift_start_time.length === 5 ? r.shift_start_time + ":00" : r.shift_start_time}+00:00`
            : null;
          const endISO = r.shift_date && r.shift_end_time
            ? `${r.shift_date}T${r.shift_end_time.length === 5 ? r.shift_end_time + ":00" : r.shift_end_time}+00:00`
            : null;
          return {
            staging_row_id: sid!,
            venue_id: venueId,
            batch_id: batchId,
            labor_clock_in: startISO,
            labor_clock_out: endISO,
            labor_cost: (r.labor_cost as number | null) ?? null,
          };
        });
      if (labor.length) {
        const { error } = await supabase.from("shift_labor_staging").insert(labor);
        if (error) throw new Error(error.message);
      }
    }

    // Audit event for staged batch
    await supabase.from("lls_v2_audit_events").insert({
      venue_id: venueId,
      event_type: "batch_staged",
      actor: userId,
      payload: {
        batch_id: batchId,
        source_kind: sourceKind,
        filename: data.filename ?? null,
        file_hash: data.fileHash ?? null,
        accepted: validation.summary.accepted,
        rejected: validation.summary.rejected,
        warnings: validation.summary.warnings,
      },
    });

    return {
      batchId,
      summary: validation.summary,
      totals: validation.totals,
      salesBasis: validation.salesBasis,
      labourBasis: validation.labourBasis,
    };
  });

// ---- list batches ----
export const listImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data, error } = await supabase
      .from("shift_import_batches_v2")
      .select(
        "id, source_kind, source_filename, source_system, file_hash, import_type, status, row_count, accepted_count, rejected_count, warning_count, gross_total, net_total, labour_total, covers_total, uploaded_by, approved_by, approved_at, committed_at, rolled_back_at, error_message, created_at",
      )
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { batches: data ?? [] };
  });

// ---- get batch detail ----
const BatchIdInput = z.object({ batchId: z.string().uuid() });

export const getImportBatchDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data: batch, error } = await supabase
      .from("shift_import_batches_v2")
      .select("*")
      .eq("id", data.batchId)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!batch) throw new Error("Batch not found");

    const { data: rows, error: rErr } = await supabase
      .from("shift_staging_rows")
      .select(
        "id, source_row_index, reconciliation_status, duplicate_status, excluded_from_canonical, identity_status, identity_confidence, status_reason, status_evidence, service_date, reported_identity_name, reported_identity_id, raw_row",
      )
      .eq("batch_id", data.batchId)
      .order("source_row_index", { ascending: true })
      .limit(500);
    if (rErr) throw new Error(rErr.message);

    return { batch, rows: rows ?? [] };
  });

// ---- approve only (no commit) ----
export const approveImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("lls_v2_approve_batch" as never, { _batch_id: data.batchId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- approve + commit ----
export const commitImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc(
      "lls_v2_commit_batch" as never,
      { _batch_id: data.batchId } as never,
    );
    if (error) throw new Error(error.message);
    return { result: res };
  });

// ---- rollback ----
export const rollbackImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc(
      "lls_v2_rollback_batch" as never,
      { _batch_id: data.batchId } as never,
    );
    if (error) throw new Error(error.message);
    return { result: res };
  });

// ---- the latest needs-review batch (for the LLS banner) ----
export const latestPendingImportBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data, error } = await supabase
      .from("shift_import_batches_v2")
      .select("id, source_kind, source_filename, status, created_at, accepted_count, rejected_count, warning_count")
      .eq("venue_id", venueId)
      .in("status", ["staged", "needs_review", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { batch: data ?? null };
  });
