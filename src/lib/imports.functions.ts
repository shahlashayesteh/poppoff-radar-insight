// Phase 6 + Phase 7 — Import staging + identity resolution server functions.
// All uploads route through staging first; manager approval is required before
// rows reach public.shifts. Reads RLS-protected; writes go through SECURITY
// DEFINER RPCs (commit/rollback/approve) or scoped inserts under the
// requireSupabaseAuth user context.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateRows, computeDupKey, type RawImportRow, type SourceKind, type BatchDefaults } from "@/lib/imports/validation";
import { inferBatchDefaults, SALES_BASIS_OPTIONS, LABOUR_BASIS_OPTIONS } from "@/lib/imports/defaults";
import {
  resolveIdentityIndexed, indexDirectory, normaliseName, summarise,
  type IdentityDirectory, type EmployeeRecord, type SourceIdLink, type AliasLink,
} from "@/lib/imports/identity";
// Phase 12A — Shared entitlement guard (was inlined in Phase 12).
import { requireImportEntitlement, requirePaidManagerEntitlement } from "@/lib/entitlements-guard";


// ---- venue resolver (Phase 16: organisation-aware, membership-validated) ----
import { resolveManagerVenueId } from "@/lib/venue-access";
async function getManagerVenueId(
  supabase: any,
  userId: string,
  requestedVenueId?: string | null,
): Promise<string> {
  return resolveManagerVenueId(supabase, userId, requestedVenueId);
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
  // Phase 16A — optional explicit venue. Single-venue managers may omit it;
  // multi-venue / head-office callers MUST send it.
  venueId: z.string().uuid().optional(),
});

export const stageImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof StageInput>) => StageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireImportEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);

    const sourceKind = data.sourceKind as SourceKind;
    const importType = sourceKind === "sales" ? "sales" : "labour";

    // Phase: infer per-batch defaults from venue context + filename/column shape.
    // These suppress per-row "missing optional context" warnings on minimal
    // CSVs (any POS vendor) without losing the underlying provenance signal.
    const { data: venueRow } = await supabase
      .from("venues")
      .select("name, organisation_id")
      .eq("id", venueId)
      .maybeSingle();
    let singleSite = true;
    const orgId = (venueRow as any)?.organisation_id ?? null;
    if (orgId) {
      const { count } = await supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", orgId);
      if ((count ?? 1) > 1) singleSite = false;
    }
    const inferred = inferBatchDefaults(data.rows as RawImportRow[], sourceKind, {
      venueName: (venueRow as any)?.name ?? null,
      singleSite,
      filename: data.filename ?? null,
      sourceSystem: data.sourceSystem ?? null,
    });

    const validation = validateRows(data.rows as RawImportRow[], sourceKind, inferred.defaults);

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
        batch_defaults: { ...inferred.defaults, inferred_reasons: inferred.reasons } as any,
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

    // ---- Phase 7: resolve employee identity for each non-rejected row ----
    const directory = await loadIdentityDirectory(supabase, venueId);
    const idx = indexDirectory(directory);
    const sourceSystem = sourceKind === "sales" ? "pos" : "labour";

    const resolutions = data.rows.map((r, i) => {
      const stagingId = idByIdx.get(i);
      if (!stagingId) return null;
      const v = validation.rows[i];
      if (v.status === "rejected") return null;
      return {
        stagingId,
        index: i,
        resolution: resolveIdentityIndexed(
          {
            source_system: sourceSystem,
            source_employee_id: (r.server_id ?? "").toString().trim() || null,
            reported_name: (r.server_name ?? "").toString().trim() || null,
            outlet_id: (r.outlet ?? "").toString().trim() || null,
            service_date: r.shift_date ?? null,
            shift_start_time: r.shift_start_time ?? null,
          },
          idx,
        ),
      };
    });

    // Batch-update staging rows with identity outcome.
    for (const item of resolutions) {
      if (!item) continue;
      const { stagingId, resolution } = item;
      await supabase
        .from("shift_staging_rows")
        .update({
          resolved_identity_id: resolution.employee_id,
          identity_match_method: resolution.method,
          identity_confidence: resolution.confidence,
          identity_status: resolution.status,
          manual_review_required: resolution.manual_review_required,
          identity_candidates: resolution.candidates as any,
          reconciliation_status:
            resolution.status === "ambiguous" || resolution.status === "pending"
              ? "identity_pending"
              : undefined,
        } as any)
        .eq("id", stagingId);
    }

    const identitySummary = summarise(
      resolutions.filter((x): x is NonNullable<typeof x> => x !== null).map((r) => r.resolution),
    );

    // Persist identity summary onto the batch (for the Data Quality panel).
    await supabase
      .from("shift_import_batches_v2")
      .update({
        validation_summary: {
          ...(validation.summary as any),
          identity: identitySummary,
        } as any,
      })
      .eq("id", batchId);

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
        identity: identitySummary as any,
      } as any,
    });


    return {
      batchId,
      summary: validation.summary,
      totals: validation.totals,
      salesBasis: validation.salesBasis,
      labourBasis: validation.labourBasis,
      identity: identitySummary,
      appliedDefaults: inferred.defaults,
      inferredReasons: inferred.reasons,
    };
  });

// ---- Phase 7: identity directory loader ----
async function loadIdentityDirectory(supabase: any, venueId: string): Promise<IdentityDirectory> {
  const [emp, sids, aliases] = await Promise.all([
    supabase.from("employee_master")
      .select("id, venue_id, display_name, normalised_name, pos_employee_id, labour_employee_id, outlet_id")
      .eq("venue_id", venueId),
    supabase.from("source_employee_ids")
      .select("venue_id, source_system, source_employee_id, employee_master_id")
      .eq("venue_id", venueId),
    supabase.from("venue_identity_aliases")
      .select("venue_id, normalised_alias, canonical_identity_id")
      .eq("venue_id", venueId),
  ]);
  if (emp.error) throw new Error(emp.error.message);
  return {
    venueId,
    employees: (emp.data ?? []) as EmployeeRecord[],
    sourceIds: (sids.data ?? []) as SourceIdLink[],
    aliases: (aliases.data ?? []) as AliasLink[],
  };
}


// Phase 16A — optional `venueId` everywhere. Single-venue managers can omit;
// multi-venue / head-office callers MUST supply it. Batch-scoped operations
// re-validate that the targeted batch belongs to the resolved venue so a
// caller cannot drive the SECURITY DEFINER commit/rollback RPC against a
// batch in another venue even if they hold its UUID.
const OptionalVenue = { venueId: z.string().uuid().optional() } as const;

// ---- list batches ----
export const listImportBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: rows, error } = await supabase
      .from("shift_import_batches_v2")
      .select(
        "id, source_kind, source_filename, source_system, file_hash, import_type, status, row_count, accepted_count, rejected_count, warning_count, gross_total, net_total, labour_total, covers_total, uploaded_by, approved_by, approved_at, committed_at, rolled_back_at, error_message, created_at",
      )
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { batches: rows ?? [] };
  });

// ---- get batch detail ----
const BatchIdInput = z.object({ batchId: z.string().uuid(), ...OptionalVenue });

export const getImportBatchDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
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

// Verify the batch is owned by the resolved venue before delegating to the
// SECURITY DEFINER lifecycle RPCs. Without this guard, a multi-venue manager
// could pass a batch UUID from venue B while their active venue is A.
async function assertBatchInVenue(supabase: any, batchId: string, venueId: string) {
  const { data: row, error } = await supabase
    .from("shift_import_batches_v2")
    .select("id")
    .eq("id", batchId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Batch not found in selected venue");
}

// ---- approve only (no commit) ----
export const approveImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    await assertBatchInVenue(supabase, data.batchId, venueId);
    const { error } = await supabase.rpc("lls_v2_approve_batch" as never, { _batch_id: data.batchId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- approve + commit ----
export const commitImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof BatchIdInput>) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireImportEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    await assertBatchInVenue(supabase, data.batchId, venueId);
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
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId, "import");
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    await assertBatchInVenue(supabase, data.batchId, venueId);
    const { data: res, error } = await supabase.rpc(
      "lls_v2_rollback_batch" as never,
      { _batch_id: data.batchId } as never,
    );
    if (error) throw new Error(error.message);
    return { result: res };
  });

// ---- the latest needs-review batch (for the LLS banner) ----
export const latestPendingImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: row, error } = await supabase
      .from("shift_import_batches_v2")
      .select("id, source_kind, source_filename, status, created_at, accepted_count, rejected_count, warning_count")
      .eq("venue_id", venueId)
      .in("status", ["staged", "needs_review", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { batch: row ?? null };
  });

// ============================================================
// Phase 7 — manager identity actions (audit-logged, RLS-scoped)
// ============================================================

const RowIdInput = z.object({ stagingRowId: z.string().uuid() });
const ConfirmMatchInput = z.object({
  stagingRowId: z.string().uuid(),
  employeeMasterId: z.string().uuid(),
});
const CreateIdentityInput = z.object({
  stagingRowId: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  posEmployeeId: z.string().max(120).optional(),
  labourEmployeeId: z.string().max(120).optional(),
});
const LinkAliasInput = z.object({
  stagingRowId: z.string().uuid(),
  employeeMasterId: z.string().uuid(),
  aliasName: z.string().min(1).max(120),
});

async function loadStagingRow(supabase: any, userId: string, stagingRowId: string) {
  const venueId = await getManagerVenueId(supabase, userId);
  const { data, error } = await supabase
    .from("shift_staging_rows")
    .select("id, venue_id, batch_id, reported_identity_id, reported_identity_name, source_kind")
    .eq("id", stagingRowId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Staging row not found for this manager's venue");
  return { row: data, venueId };
}

async function audit(supabase: any, venueId: string, userId: string, event: string, payload: any) {
  await supabase.from("lls_v2_audit_events").insert({
    venue_id: venueId, event_type: event, actor: userId, payload,
  });
}

// Confirm an existing employee match for a staging row.
export const confirmIdentityMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ConfirmMatchInput>) => ConfirmMatchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { row, venueId } = await loadStagingRow(supabase, userId, data.stagingRowId);

    // Verify the employee belongs to this venue.
    const { data: emp, error: eErr } = await supabase
      .from("employee_master")
      .select("id, display_name")
      .eq("id", data.employeeMasterId)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!emp) throw new Error("Employee not found in this venue");

    const { error: uErr } = await supabase
      .from("shift_staging_rows")
      .update({
        resolved_identity_id: emp.id,
        identity_status: "resolved",
        identity_match_method: "manager_confirmed",
        identity_confidence: 1.0,
        manager_confirmed_match: true,
        manual_review_required: false,
        reconciliation_status: "pending",
      } as any)
      .eq("id", row.id);
    if (uErr) throw new Error(uErr.message);

    await audit(supabase, venueId, userId, "identity_confirmed", {
      staging_row_id: row.id, batch_id: row.batch_id,
      employee_master_id: emp.id, employee_name: emp.display_name,
      reported_name: row.reported_identity_name, reported_id: row.reported_identity_id,
    });
    // Phase 19: merge/link audit trail.
    await supabase.from("employee_identity_merges").insert({
      venue_id: venueId,
      action: "link_source_id",
      primary_employee_id: emp.id,
      payload: {
        kind: "confirm_match",
        reported_id: row.reported_identity_id,
        reported_name: row.reported_identity_name,
        source_kind: row.source_kind,
      },
      performed_by: userId,
    });
    return { ok: true };
  });

// Create a brand-new employee identity from a staging row.
export const createEmployeeIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof CreateIdentityInput>) => CreateIdentityInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { row, venueId } = await loadStagingRow(supabase, userId, data.stagingRowId);
    const normalised = data.displayName.trim().toLowerCase().replace(/\s+/g, " ");

    // Phase 19: resolve organisation linkage from the venue so cross-venue
    // eligibility decisions later have an anchor. Defaults to single-venue
    // scope; cross-venue eligibility remains false until manager opts in.
    const { data: venueRow } = await supabase
      .from("venues")
      .select("organisation_id")
      .eq("id", venueId)
      .maybeSingle();

    const { data: emp, error: iErr } = await supabase
      .from("employee_master")
      .insert({
        venue_id: venueId,
        organisation_id: (venueRow as any)?.organisation_id ?? null,
        display_name: data.displayName.trim(),
        normalised_name: normalised,
        pos_employee_id: data.posEmployeeId ?? null,
        labour_employee_id: data.labourEmployeeId ?? null,
        manager_confirmed: true,
        cross_venue_eligible: false,
        created_by: userId,
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);

    // Also persist the reported source ID if present.
    if (row.reported_identity_id) {
      await supabase.from("source_employee_ids").insert({
        venue_id: venueId,
        employee_master_id: emp.id,
        source_system: row.source_kind === "sales" ? "pos" : "labour",
        source_employee_id: row.reported_identity_id,
        confirmed_by: userId,
      });
    }

    // Phase 19: merges/links audit trail.
    await supabase.from("employee_identity_merges").insert({
      venue_id: venueId,
      action: "link_source_id",
      primary_employee_id: emp.id,
      payload: {
        kind: "create",
        display_name: data.displayName.trim(),
        reported_id: row.reported_identity_id,
        reported_name: row.reported_identity_name,
        source_kind: row.source_kind,
      },
      performed_by: userId,
    });

    await supabase
      .from("shift_staging_rows")
      .update({
        resolved_identity_id: emp.id,
        identity_status: "resolved",
        identity_match_method: "manager_created",
        identity_confidence: 1.0,
        manager_confirmed_match: true,
        manual_review_required: false,
        reconciliation_status: "pending",
      } as any)
      .eq("id", row.id);

    await audit(supabase, venueId, userId, "identity_created", {
      staging_row_id: row.id, batch_id: row.batch_id, employee_master_id: emp.id,
      display_name: data.displayName.trim(),
    });
    return { ok: true, employeeMasterId: emp.id };
  });

// Link the reported name as an alias of an existing canonical employee.
export const linkIdentityAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof LinkAliasInput>) => LinkAliasInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { row, venueId } = await loadStagingRow(supabase, userId, data.stagingRowId);
    const normalised = data.aliasName.trim().toLowerCase().replace(/\s+/g, " ");

    const { error: aErr } = await supabase
      .from("venue_identity_aliases")
      .upsert({
        venue_id: venueId,
        canonical_identity_id: data.employeeMasterId,
        alias_name: data.aliasName.trim(),
        normalised_alias: normalised,
        source: "manager_confirmed",
      }, { onConflict: "venue_id,normalised_alias" });
    if (aErr) throw new Error(aErr.message);

    await supabase
      .from("shift_staging_rows")
      .update({
        resolved_identity_id: data.employeeMasterId,
        identity_status: "resolved",
        identity_match_method: "confirmed_alias",
        identity_confidence: 0.95,
        manager_confirmed_match: true,
        manual_review_required: false,
        reconciliation_status: "pending",
      } as any)
      .eq("id", row.id);

    await audit(supabase, venueId, userId, "identity_alias_linked", {
      staging_row_id: row.id, batch_id: row.batch_id,
      employee_master_id: data.employeeMasterId, alias: data.aliasName.trim(),
    });
    // Phase 19: merge/link audit trail.
    await supabase.from("employee_identity_merges").insert({
      venue_id: venueId,
      action: "link_alias",
      primary_employee_id: data.employeeMasterId,
      payload: { alias: data.aliasName.trim(), source_kind: row.source_kind },
      performed_by: userId,
    });
    return { ok: true };
  });

// Exclude a row from the import (e.g. unresolved ambiguity the manager chooses not to fix).
export const excludeStagingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof RowIdInput>) => RowIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { row, venueId } = await loadStagingRow(supabase, userId, data.stagingRowId);
    const { error } = await supabase
      .from("shift_staging_rows")
      .update({
        excluded_from_canonical: true,
        identity_status: "excluded",
        reconciliation_status: "excluded_invalid",
        manual_review_required: false,
        status_reason: "manager_excluded",
      } as any)
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    await audit(supabase, venueId, userId, "identity_row_excluded", {
      staging_row_id: row.id, batch_id: row.batch_id,
    });
    return { ok: true };
  });

// Directory list for the manager UI (employees + aliases).
// Phase 16A — accepts optional venueId so multi-venue managers can scope.
export const listVenueEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { venueId?: string } | undefined) =>
    z.object(OptionalVenue).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    const { data: rows, error } = await supabase
      .from("employee_master")
      .select("id, display_name, normalised_name, pos_employee_id, labour_employee_id, status")
      .eq("venue_id", venueId)
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { employees: rows ?? [] };
  });

// ============================================================
// Apply / update per-batch defaults and re-validate staged rows.
// Lets the manager declare outlet / revenue centre / sales basis /
// labour basis once, and clears the "missing optional context"
// warnings that were emitted at stage time. Real warnings
// (duplicates, identity ambiguity, missing dates) are unaffected.
// ============================================================
const ApplyDefaultsInput = z.object({
  batchId: z.string().uuid(),
  defaults: z.object({
    outlet: z.string().max(120).nullable().optional(),
    revenue_centre: z.string().max(120).nullable().optional(),
    sales_basis: z.enum(SALES_BASIS_OPTIONS).nullable().optional(),
    labour_basis: z.enum(LABOUR_BASIS_OPTIONS).nullable().optional(),
  }),
  ...OptionalVenue,
});

export const applyBatchDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof ApplyDefaultsInput>) => ApplyDefaultsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePaidManagerEntitlement(supabase, userId);
    const venueId = await getManagerVenueId(supabase, userId, data.venueId);
    await assertBatchInVenue(supabase, data.batchId, venueId);

    // Load batch source_kind + every staged row's raw_row so we can re-validate.
    const { data: batchRow, error: bErr } = await supabase
      .from("shift_import_batches_v2")
      .select("id, source_kind, batch_defaults")
      .eq("id", data.batchId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!batchRow) throw new Error("Batch not found");

    const { data: stagedRows, error: rErr } = await supabase
      .from("shift_staging_rows")
      .select("id, source_row_index, raw_row, excluded_from_canonical, identity_status, manager_confirmed_match, duplicate_status")
      .eq("batch_id", data.batchId)
      .order("source_row_index", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    const defaults: BatchDefaults = {
      outlet: (data.defaults.outlet ?? null) || null,
      revenue_centre: (data.defaults.revenue_centre ?? null) || null,
      sales_basis: (data.defaults.sales_basis ?? null) || null,
      labour_basis: (data.defaults.labour_basis ?? null) || null,
    };

    const sourceKind = batchRow.source_kind as SourceKind;
    const rawRows = (stagedRows ?? []).map((r: any) => r.raw_row as RawImportRow);
    const validation = validateRows(rawRows, sourceKind, defaults);

    // Re-stamp per-row reasons (preserve manager actions: identity / excluded / duplicate).
    for (let i = 0; i < (stagedRows ?? []).length; i++) {
      const sr = (stagedRows as any[])[i];
      const v = validation.rows[i];
      // Preserve any identity / exclusion / duplicate reasons already on the row
      // by merging — but the validator output is authoritative for context warnings.
      const newReason = v.reasons.join(",") || null;
      await supabase
        .from("shift_staging_rows")
        .update({
          status_reason: newReason,
          status_evidence: { reasons: v.reasons, ...(v.evidence as Record<string, unknown>) } as any,
        } as any)
        .eq("id", sr.id);
    }

    // Persist defaults + refreshed summary on the batch.
    const existingDefaults = (batchRow.batch_defaults as any) ?? {};
    const { error: uErr } = await supabase
      .from("shift_import_batches_v2")
      .update({
        accepted_count: validation.summary.accepted,
        warning_count: validation.summary.warnings,
        rejected_count: validation.summary.rejected,
        sales_basis_summary: validation.salesBasis as any,
        labour_basis_summary: validation.labourBasis as any,
        validation_summary: validation.summary as any,
        batch_defaults: {
          ...existingDefaults,
          ...defaults,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        } as any,
      } as any)
      .eq("id", data.batchId);
    if (uErr) throw new Error(uErr.message);

    await audit(supabase, venueId, userId, "batch_defaults_applied", {
      batch_id: data.batchId, defaults, summary: validation.summary,
    });

    return { ok: true, summary: validation.summary, defaults };
  });

