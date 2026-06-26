// Phase 6 + Phase 7 — Import batch detail + Data Quality + Identity Quality.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getImportBatchDetail,
  approveImportBatch,
  commitImportBatch,
  rollbackImportBatch,
  purgeImportBatch,

  confirmIdentityMatch,
  createEmployeeIdentity,
  linkIdentityAlias,
  excludeStagingRow,
  listVenueEmployees,
  applyBatchDefaults,
} from "@/lib/imports.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ManagerLayout } from "@/components/manager-layout";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { ReliabilityBadge } from "@/components/reliability";
import { ManagerTraceDrawer, type TracePayload } from "@/components/manager/manager-trace-drawer";
import { getImportTrace } from "@/lib/manager-trace.functions";

export const Route = createFileRoute("/manager/imports/$batchId")({
  component: () => (
    <PaidManagerGate feature="imports">
      <ImportBatchDetail />
    </PaidManagerGate>
  ),
});

type Batch = {
  id: string;
  venue_id: string;
  source_kind: string;
  source_filename: string | null;
  source_system: string | null;
  file_hash: string | null;
  import_type: string | null;
  status: string;
  row_count: number;
  accepted_count: number;
  rejected_count: number;
  warning_count: number;
  gross_total: number | null;
  net_total: number | null;
  labour_total: number | null;
  covers_total: number | null;
  sales_basis_summary: Record<string, unknown>;
  labour_basis_summary: Record<string, unknown>;
  validation_summary: Record<string, unknown>;
  approved_by: string | null;
  approved_at: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
  error_message: string | null;
  uploaded_by: string | null;
  created_at: string;
  committed_shift_ids: string[] | null;
  batch_defaults: Record<string, unknown> | null;
};

type Row = {
  id: string;
  source_row_index: number | null;
  reconciliation_status: string;
  duplicate_status: string;
  excluded_from_canonical: boolean;
  identity_status: string;
  identity_confidence: number | null;
  manual_review_required?: boolean;
  manager_confirmed_match?: boolean;
  identity_candidates?: Array<{ employee_id: string; display_name: string; reason: string }>;
  status_reason: string | null;
  status_evidence: Record<string, unknown>;
  service_date: string | null;
  reported_identity_name: string | null;
  reported_identity_id: string | null;
};

type Employee = { id: string; display_name: string; pos_employee_id: string | null; labour_employee_id: string | null };

function ImportBatchDetail() {
  const { batchId } = Route.useParams();
  const navigate = useNavigate();
  const fetchDetail = useServerFn(getImportBatchDetail);
  const doApprove = useServerFn(approveImportBatch);
  const doCommit = useServerFn(commitImportBatch);
  const doRollback = useServerFn(rollbackImportBatch);
  const doConfirm = useServerFn(confirmIdentityMatch);
  const doCreate = useServerFn(createEmployeeIdentity);
  const doAlias = useServerFn(linkIdentityAlias);
  const doExclude = useServerFn(excludeStagingRow);
  const fetchEmployees = useServerFn(listVenueEmployees);
  const doApplyDefaults = useServerFn(applyBatchDefaults);
  const fetchImportTrace = useServerFn(getImportTrace);
  const [importTrace, setImportTrace] = useState<TracePayload>({ kind: "loading" });

  const active = useActiveVenue();
  const venueId = active.venueId ?? undefined;

  const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);


  const load = useCallback(async () => {
    if (!venueId) return;
    try {
      const [res, emp] = await Promise.all([
        fetchDetail({ data: { batchId, venueId } }),
        fetchEmployees({ data: { venueId } }).catch(() => ({ employees: [] as Employee[] })),
      ]);
      setBatch(res.batch as Batch);
      setRows((res.rows ?? []) as Row[]);
      setEmployees((emp?.employees ?? []) as Employee[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load batch");
    } finally {
      setLoading(false);
    }
  }, [fetchDetail, fetchEmployees, batchId, venueId]);

  useEffect(() => { void load(); }, [load]);

  // ---- Phase 7 manager identity actions ----
  const onConfirm = async (stagingRowId: string, employeeMasterId: string) => {
    setBusy(true);
    try { await doConfirm({ data: { stagingRowId, employeeMasterId } }); toast.success("Match confirmed"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Confirm failed"); }
    finally { setBusy(false); }
  };
  const onCreate = async (stagingRowId: string, reportedName: string) => {
    const name = prompt("New employee display name", reportedName || "");
    if (!name) return;
    setBusy(true);
    try { await doCreate({ data: { stagingRowId, displayName: name } }); toast.success("Employee created"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Create failed"); }
    finally { setBusy(false); }
  };
  const onAlias = async (stagingRowId: string, employeeMasterId: string, aliasName: string) => {
    setBusy(true);
    try { await doAlias({ data: { stagingRowId, employeeMasterId, aliasName } }); toast.success("Alias linked"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Alias failed"); }
    finally { setBusy(false); }
  };
  const onExclude = async (stagingRowId: string) => {
    if (!confirm("Exclude this row from the import?")) return;
    setBusy(true);
    try { await doExclude({ data: { stagingRowId } }); toast.success("Row excluded"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Exclude failed"); }
    finally { setBusy(false); }
  };


  const onApprove = async () => {
    setBusy(true);
    try { await doApprove({ data: { batchId, venueId } }); toast.success("Batch approved"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Approve failed"); }
    finally { setBusy(false); }
  };
  const onCommit = async () => {
    if (!confirm("Commit this batch to live LLS data? This applies the accepted rows to the shifts table.")) return;
    setBusy(true);
    try {
      const res = await doCommit({ data: { batchId, venueId } });
      toast.success(`Committed ${(res.result as any)?.committed ?? "?"} rows`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Commit failed"); }
    finally { setBusy(false); }
  };
  const onRollback = async () => {
    if (!confirm("Roll back this batch? Committed shifts still tagged with this batch will be removed.")) return;
    setBusy(true);
    try {
      const res = await doRollback({ data: { batchId, venueId } });
      const r = res.result as any;
      toast.success(`Rolled back. Removed ${r?.deleted ?? 0}, skipped ${r?.skipped ?? 0} (later imports preserved).`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Rollback failed"); }
    finally { setBusy(false); }
  };

  if (active.status !== "ready") {
    return (
      <ManagerLayout>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <NoVenueState status={active.status} venues={active.venues} />
        </div>
      </ManagerLayout>
    );
  }
  if (loading) {
    return <ManagerLayout><div className="mx-auto max-w-6xl px-4 py-6">Loading…</div></ManagerLayout>;
  }
  if (!batch) {
    return <ManagerLayout><div className="mx-auto max-w-6xl px-4 py-6">Batch not found. <Link to="/manager/imports" className="underline">Back</Link></div></ManagerLayout>;
  }

  const canApprove = ["staged", "needs_review"].includes(batch.status);
  const canCommit = ["staged", "needs_review", "approved"].includes(batch.status);
  const canRollback = ["staged", "needs_review", "committed"].includes(batch.status);

  return (
    <ManagerLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/manager/imports" className="text-xs text-muted-foreground hover:underline">← All imports</Link>
            <h1 className="text-2xl font-bold">{batch.source_filename || "(no filename)"}</h1>
            <p className="text-xs text-muted-foreground">
              {batch.source_kind} · {batch.source_system ?? "unknown source"} · uploaded {new Date(batch.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ManagerTraceDrawer
              label="Trace source"
              title={`Import batch · ${batch.source_filename ?? batch.id}`}
              payload={importTrace}
              onOpen={async () => {
                if (!venueId) return;
                setImportTrace({ kind: "loading" });
                try {
                  const res = await fetchImportTrace({ data: { venueId, batchId } });
                  if (!res.found) setImportTrace({ kind: "empty", message: "Batch not found." });
                  else setImportTrace({ kind: "import", batch: res.batch, sampleRows: res.sampleRows });
                } catch (e: any) {
                  setImportTrace({ kind: "error", message: e?.message ?? "Failed to load trace" });
                }
              }}
            />
            <Badge>{batch.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>


        {batch.file_hash && (
          <p className="text-xs text-muted-foreground font-mono break-all">
            file_hash: {batch.file_hash.slice(0, 32)}…
          </p>
        )}

        {/* Data Quality panel */}
        <Card>
          <CardHeader><CardTitle>Data Quality</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Total rows" value={batch.row_count} />
            <Stat label="Accepted" value={batch.accepted_count} tone="ok" />
            <Stat label="Warnings" value={batch.warning_count} tone="warn" />
            <Stat label="Rejected" value={batch.rejected_count} tone="bad" />

            <Stat label="Gross total" value={batch.gross_total != null ? `£${Math.round(batch.gross_total).toLocaleString()}` : "—"} />
            <Stat label="Net total" value={batch.net_total != null ? `£${Math.round(batch.net_total).toLocaleString()}` : "—"} />
            <Stat label="Labour total" value={batch.labour_total != null ? `£${Math.round(batch.labour_total).toLocaleString()}` : "—"} />
            <Stat label="Covers total" value={batch.covers_total ?? "—"} />

            <StatWithReliability
              label="Sales basis"
              value={String((batch.sales_basis_summary as any)?.mode ?? "—")}
              field={salesBasisToReliability((batch.sales_basis_summary as any)?.mode)}
            />
            <StatWithReliability
              label="Labour basis"
              value={String((batch.labour_basis_summary as any)?.mode ?? "—")}
              field={labourBasisToReliability((batch.labour_basis_summary as any)?.mode)}
            />
            <Stat label="Missing start time" value={Number((batch.validation_summary as any)?.missingStartTime ?? 0)} tone="warn" />
            <Stat label="Duplicates" value={Number((batch.validation_summary as any)?.duplicates ?? 0)} tone="warn" />
          </CardContent>
        </Card>

        {/* Phase 17B — Per-field reliability key */}
        <Card>
          <CardHeader><CardTitle>Field reliability key</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            <ReliabilityBadge field="pos_check_total" prefix="Sales rows" />
            <ReliabilityBadge field="labour_paid_hours" prefix="Labour hours" />
            <ReliabilityBadge field="pos_server_id" prefix="Server ID" />
            <ReliabilityBadge field="sevenrooms_section" prefix="Sections" />
            <ReliabilityBadge field="missing_server_id" prefix="Missing server ID" />
            <p className="basis-full text-[11px] text-muted-foreground mt-1">
              Measured POS / labour rows feed scoring. Sections and bookings are context only unless verified. Rows missing server ID are blocked from server-level scoring.
            </p>
          </CardContent>
        </Card>

        {/* Per-batch defaults (suppress noise from minimal CSVs) */}
        <BatchDefaultsCard
          batch={batch}
          busy={busy}
          onSave={async (next) => {
            if (!venueId) return;
            setBusy(true);
            try {
              const res = await doApplyDefaults({ data: { batchId, venueId, defaults: next } });
              toast.success(`Defaults applied · ${res.summary.warnings} advisory flag${res.summary.warnings === 1 ? "" : "s"} remain.`);
              await load();
            } catch (e: any) { toast.error(e?.message ?? "Apply failed"); }
            finally { setBusy(false); }
          }}
        />

        {/* Warning breakdown — explains what 'N warnings' actually is */}
        <WarningBreakdownCard batch={batch} rows={rows} />

        {/* Identity Quality (Phase 7) */}
        <IdentityQualityCard rows={rows} batchValidation={batch.validation_summary} />

        {/* Approval actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onApprove} disabled={!canApprove || busy} variant="outline">
            Approve (no commit)
          </Button>
          <Button onClick={onCommit} disabled={!canCommit || busy}>
            Approve &amp; commit to LLS
          </Button>
          <Button onClick={onRollback} disabled={!canRollback || busy} variant="destructive">
            Rollback
          </Button>
          <Button onClick={() => navigate({ to: "/manager/imports" })} variant="ghost">Back</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Commit is blocked while any non-excluded row has an unresolved or ambiguous employee identity.
          Rollback is best-effort — only shifts still tagged with this batch are removed.
        </p>

        {batch.committed_shift_ids && batch.committed_shift_ids.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Committed shift rows: {batch.committed_shift_ids.length}
            {batch.committed_at && ` at ${new Date(batch.committed_at).toLocaleString()}`}
          </p>
        )}

        {/* Row preview with identity resolution + manager actions */}
        <Card>
          <CardHeader><CardTitle>Rows (first 500)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-2">#</th>
                  <th className="pr-2">Date</th>
                  <th className="pr-2">Reported</th>
                  <th className="pr-2">Identity</th>
                  <th className="pr-2">Status</th>
                  <th className="pr-2">Reasons</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="pr-2 py-1 text-muted-foreground">{r.source_row_index}</td>
                    <td className="pr-2 py-1">{r.service_date ?? "—"}</td>
                    <td className="pr-2 py-1">
                      <div>{r.reported_identity_name ?? "—"}</div>
                      {r.reported_identity_id && (
                        <div className="text-muted-foreground font-mono">{r.reported_identity_id}</div>
                      )}
                    </td>
                    <td className="pr-2 py-1">
                      <IdentityBadge row={r} />
                    </td>
                    <td className="pr-2 py-1">
                      {r.excluded_from_canonical
                        ? <span className="text-rose-700">excluded</span>
                        : r.reconciliation_status === "duplicate_pending"
                          ? <span className="text-amber-700">duplicate</span>
                          : r.identity_status === "ambiguous"
                            ? <span className="text-rose-700">ambiguous</span>
                            : r.identity_status === "new_unverified"
                              ? <span className="text-amber-700">new (unverified)</span>
                              : r.status_reason
                                ? <span className="text-amber-700">warning</span>
                                : <span className="text-emerald-700">accepted</span>}
                    </td>
                    <td className="pr-2 py-1 text-muted-foreground">{r.status_reason || "—"}</td>
                    <td className="py-1">
                      {!r.excluded_from_canonical && (r.identity_status === "ambiguous" || r.identity_status === "new_unverified" || r.manual_review_required) ? (
                        <IdentityActions
                          row={r} employees={employees} busy={busy}
                          onConfirm={onConfirm} onCreate={onCreate}
                          onAlias={onAlias} onExclude={onExclude}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </ManagerLayout>
  );
}

function IdentityQualityCard({ rows, batchValidation }: { rows: Row[]; batchValidation: Record<string, unknown> }) {
  const counts = {
    resolved: 0, ambiguous: 0, unmatched: 0, new_unverified: 0, manual: 0, confirmed: 0,
  };
  for (const r of rows) {
    if (r.identity_status === "resolved") counts.resolved++;
    else if (r.identity_status === "ambiguous") counts.ambiguous++;
    else if (r.identity_status === "unmatched") counts.unmatched++;
    else if (r.identity_status === "new_unverified") counts.new_unverified++;
    if (r.manual_review_required) counts.manual++;
    if (r.manager_confirmed_match) counts.confirmed++;
  }
  const summary = (batchValidation as any)?.identity ?? null;
  return (
    <Card>
      <CardHeader><CardTitle>Identity Quality</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Matched employees" value={counts.resolved} tone="ok" />
        <Stat label="Ambiguous" value={counts.ambiguous} tone="bad" />
        <Stat label="New (unverified)" value={counts.new_unverified} tone="warn" />
        <Stat label="Unmatched" value={counts.unmatched} tone="warn" />
        <Stat label="Manual review needed" value={counts.manual} tone={counts.manual > 0 ? "warn" : "ok"} />
        <Stat label="Manager-confirmed" value={counts.confirmed} tone="ok" />
        {summary && (
          <Stat label="High-confidence (batch)" value={Number((summary as any).high_confidence ?? 0)} />
        )}
      </CardContent>
    </Card>
  );
}

function IdentityBadge({ row }: { row: Row }) {
  const conf = row.identity_confidence != null ? `${Math.round(row.identity_confidence * 100)}%` : "—";
  const status = row.identity_status || "pending";
  const tone =
    status === "resolved" ? "text-emerald-700" :
    status === "ambiguous" || status === "unmatched" ? "text-rose-700" :
    status === "new_unverified" ? "text-amber-700" : "text-muted-foreground";
  return (
    <div className={`text-xs ${tone}`}>
      <div className="font-medium">{status}</div>
      <div className="text-muted-foreground">confidence {conf}</div>
      {row.manager_confirmed_match && <div className="text-emerald-700">manager-confirmed</div>}
    </div>
  );
}

function IdentityActions({
  row, employees, busy, onConfirm, onCreate, onAlias, onExclude,
}: {
  row: Row; employees: Employee[]; busy: boolean;
  onConfirm: (sid: string, eid: string) => void;
  onCreate: (sid: string, name: string) => void;
  onAlias: (sid: string, eid: string, alias: string) => void;
  onExclude: (sid: string) => void;
}) {
  const [pick, setPick] = useState<string>("");
  const candidates = row.identity_candidates ?? [];
  return (
    <div className="flex flex-col gap-1">
      {candidates.length > 0 && candidates.map((c) => (
        <Button key={c.employee_id} size="sm" variant="outline" disabled={busy}
          onClick={() => onConfirm(row.id, c.employee_id)}>
          Confirm: {c.display_name}
        </Button>
      ))}
      <div className="flex gap-1">
        <select
          className="border rounded text-xs px-1"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">— pick existing —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.display_name}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={!pick || busy}
          onClick={() => onConfirm(row.id, pick)}>Match</Button>
        <Button size="sm" variant="outline" disabled={!pick || busy}
          onClick={() => onAlias(row.id, pick, row.reported_identity_name ?? "")}>
          Link alias
        </Button>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={busy}
          onClick={() => onCreate(row.id, row.reported_identity_name ?? "")}>
          Create new
        </Button>
        <Button size="sm" variant="destructive" disabled={busy}
          onClick={() => onExclude(row.id)}>Exclude</Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" }) {
  const cls =
    tone === "ok" ? "text-emerald-700" :
    tone === "warn" ? "text-amber-700" :
    tone === "bad" ? "text-rose-700" : "text-foreground";
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function StatWithReliability({
  label,
  value,
  field,
}: {
  label: string;
  value: string | number;
  field: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold flex items-center gap-1.5 flex-wrap">
        <span>{value}</span>
        <ReliabilityBadge field={field} />
      </div>
    </div>
  );
}

function salesBasisToReliability(mode: unknown): string {
  switch (mode) {
    case "net_sales_source":
    case "gross_sales_source":
      return "pos_check_total";
    case "net_sales_derived":
      return "rpc";
    case "gross_used_as_net_estimate":
      return "gross_used_as_net";
    case "mixed":
      return "gross_used_as_net";
    default:
      return "unknown";
  }
}

function labourBasisToReliability(mode: unknown): string {
  switch (mode) {
    case "fully_loaded":
    case "total":
    case "wage_plus_oncost":
    case "wage_only":
      return "labour_wage_cost_known_basis";
    case "rate_times_hours":
      return "hours_times_rate_labour";
    case "mixed":
    case "unknown":
      return "labour_wage_cost_unknown_basis";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// BatchDefaultsCard — lets the manager declare outlet / RC / sales basis /
// labour basis once per batch. Saving re-validates the staged rows and clears
// the "missing optional context" warnings on a clean upload.
// ---------------------------------------------------------------------------
type DefaultsPayload = {
  outlet: string | null;
  revenue_centre: string | null;
  sales_basis: "net" | "gross" | "gross_with_tax" | null;
  labour_basis: "wages_only" | "wages_plus_oncosts" | "fully_loaded" | null;
};

function BatchDefaultsCard({
  batch,
  busy,
  onSave,
}: {
  batch: Batch;
  busy: boolean;
  onSave: (next: DefaultsPayload) => void | Promise<void>;
}) {
  const d = (batch.batch_defaults ?? {}) as Record<string, unknown>;
  const inferredReasons = Array.isArray((d as any).inferred_reasons)
    ? ((d as any).inferred_reasons as string[])
    : [];
  const [outlet, setOutlet] = useState<string>((d.outlet as string) ?? "");
  const [rc, setRc] = useState<string>((d.revenue_centre as string) ?? "");
  const [salesBasis, setSalesBasis] = useState<string>((d.sales_basis as string) ?? "");
  const [labourBasis, setLabourBasis] = useState<string>((d.labour_basis as string) ?? "");

  const isSales = batch.source_kind === "sales";
  const isLabour = batch.source_kind === "labor";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch defaults</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Declare context once per upload. We use these defaults to stamp provenance on commit
          and to clear advisory warnings about missing optional context. Real data problems
          (duplicates, ambiguous identity, bad dates) are not affected.
        </p>

        {inferredReasons.length > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-xs text-emerald-900">
            <div className="font-medium">Auto-detected at upload:</div>
            <ul className="list-disc list-inside">
              {inferredReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Default outlet</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={outlet}
              placeholder="e.g. Riverside Bistro"
              onChange={(e) => setOutlet(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Default revenue centre</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={rc}
              placeholder="e.g. Main"
              onChange={(e) => setRc(e.target.value)}
            />
          </label>

          {isSales && (
            <label className="text-xs">
              <span className="text-muted-foreground">Sales basis</span>
              <select
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={salesBasis}
                onChange={(e) => setSalesBasis(e.target.value)}
              >
                <option value="">— pick one —</option>
                <option value="net">net (post-discount, ex-tax)</option>
                <option value="gross">gross (pre-tax, pre-discount)</option>
                <option value="gross_with_tax">gross including tax</option>
              </select>
            </label>
          )}

          {isLabour && (
            <label className="text-xs">
              <span className="text-muted-foreground">Labour basis</span>
              <select
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={labourBasis}
                onChange={(e) => setLabourBasis(e.target.value)}
              >
                <option value="">— pick one —</option>
                <option value="wages_only">wages only</option>
                <option value="wages_plus_oncosts">wages + oncosts (NI / pension)</option>
                <option value="fully_loaded">fully loaded (incl. on-cost & benefits)</option>
              </select>
            </label>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onSave({
                outlet: outlet.trim() || null,
                revenue_centre: rc.trim() || null,
                sales_basis: (salesBasis as DefaultsPayload["sales_basis"]) || null,
                labour_basis: (labourBasis as DefaultsPayload["labour_basis"]) || null,
              })
            }
          >
            Save & re-validate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WarningBreakdownCard — explains what the warning count actually is.
// Groups by reason with plain-English meaning and a "blocks commit?" tag.
// ---------------------------------------------------------------------------
const REASON_META: Record<string, { label: string; blocks: boolean; help: string }> = {
  missing_outlet:           { label: "Missing outlet",           blocks: false, help: "Row had no outlet column. Set a default above to clear." },
  missing_revenue_centre:   { label: "Missing revenue centre",   blocks: false, help: "Row had no revenue centre. Set a default above to clear." },
  missing_start_time:       { label: "Missing start time",       blocks: false, help: "Daypart will be inferred from the date on commit." },
  gross_only_no_net:        { label: "Gross-only sales",         blocks: false, help: "File contained gross_sales but no net_sales. LLS will tag this provenance honestly. Declare a sales basis above to silence." },
  unknown_sales_basis:      { label: "Unknown sales basis",      blocks: false, help: "No sales_basis column. Declare one above so provenance is recorded." },
  unknown_labor_basis:      { label: "Unknown labour basis",     blocks: false, help: "No labor_basis column. Declare one above so provenance is recorded." },
  duplicate_row:            { label: "Duplicate rows",           blocks: true,  help: "Same server + date + start. Review and exclude if not real." },
  missing_server_identity:  { label: "Missing server identity",  blocks: true,  help: "Row has neither a server name nor server id and is rejected." },
  missing_shift_date:       { label: "Missing shift date",       blocks: true,  help: "Row has no date and is rejected." },
  invalid_shift_date_format:{ label: "Invalid date format",      blocks: true,  help: "Date is not YYYY-MM-DD and is rejected." },
};

function WarningBreakdownCard({ batch, rows }: { batch: Batch; rows: Row[] }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.status_reason) continue;
    for (const reason of r.status_reason.split(",").map((s) => s.trim()).filter(Boolean)) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const total = batch.warning_count + batch.rejected_count;
  if (total === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Warning breakdown</CardTitle></CardHeader>
        <CardContent className="text-sm text-emerald-700">No warnings or rejections. Safe to commit.</CardContent>
      </Card>
    );
  }
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHeader><CardTitle>Warning breakdown</CardTitle></CardHeader>
      <CardContent className="text-xs">
        <p className="text-muted-foreground mb-2">
          Advisory flags are safe to commit. Only "blocks commit" rows must be resolved first.
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pr-2 py-1">Reason</th>
              <th className="pr-2 py-1">Rows</th>
              <th className="pr-2 py-1">Effect</th>
              <th className="py-1">What it means</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([reason, n]) => {
              const meta = REASON_META[reason] ?? { label: reason, blocks: false, help: "See row detail below." };
              return (
                <tr key={reason} className="border-t align-top">
                  <td className="pr-2 py-1 font-medium">{meta.label}</td>
                  <td className="pr-2 py-1">{n}</td>
                  <td className="pr-2 py-1">
                    {meta.blocks
                      ? <span className="text-rose-700">blocks commit</span>
                      : <span className="text-amber-700">advisory</span>}
                  </td>
                  <td className="py-1 text-muted-foreground">{meta.help}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
