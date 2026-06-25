// Phase 6 + Phase 7 — Import batch detail + Data Quality + Identity Quality.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getImportBatchDetail,
  approveImportBatch,
  commitImportBatch,
  rollbackImportBatch,
  confirmIdentityMatch,
  createEmployeeIdentity,
  linkIdentityAlias,
  excludeStagingRow,
  listVenueEmployees,
} from "@/lib/imports.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ManagerLayout } from "@/components/manager-layout";

export const Route = createFileRoute("/manager/imports/$batchId")({
  component: ImportBatchDetail,
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

  const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);


  const load = useCallback(async () => {
    try {
      const res = await fetchDetail({ data: { batchId } });
      setBatch(res.batch as Batch);
      setRows((res.rows ?? []) as Row[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load batch");
    } finally {
      setLoading(false);
    }
  }, [fetchDetail, batchId]);

  useEffect(() => { void load(); }, [load]);

  const onApprove = async () => {
    setBusy(true);
    try { await doApprove({ data: { batchId } }); toast.success("Batch approved"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Approve failed"); }
    finally { setBusy(false); }
  };
  const onCommit = async () => {
    if (!confirm("Commit this batch to live LLS data? This applies the accepted rows to the shifts table.")) return;
    setBusy(true);
    try {
      const res = await doCommit({ data: { batchId } });
      toast.success(`Committed ${(res.result as any)?.committed ?? "?"} rows`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Commit failed"); }
    finally { setBusy(false); }
  };
  const onRollback = async () => {
    if (!confirm("Roll back this batch? Committed shifts still tagged with this batch will be removed.")) return;
    setBusy(true);
    try {
      const res = await doRollback({ data: { batchId } });
      const r = res.result as any;
      toast.success(`Rolled back. Removed ${r?.deleted ?? 0}, skipped ${r?.skipped ?? 0} (later imports preserved).`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Rollback failed"); }
    finally { setBusy(false); }
  };

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
          <Badge>{batch.status.replace(/_/g, " ")}</Badge>
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

            <Stat label="Sales basis" value={String((batch.sales_basis_summary as any)?.mode ?? "—")} />
            <Stat label="Labour basis" value={String((batch.labour_basis_summary as any)?.mode ?? "—")} />
            <Stat label="Missing start time" value={Number((batch.validation_summary as any)?.missingStartTime ?? 0)} tone="warn" />
            <Stat label="Duplicates" value={Number((batch.validation_summary as any)?.duplicates ?? 0)} tone="warn" />
          </CardContent>
        </Card>

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

        {batch.committed_shift_ids && batch.committed_shift_ids.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Committed shift rows: {batch.committed_shift_ids.length}
            {batch.committed_at && ` at ${new Date(batch.committed_at).toLocaleString()}`}
          </p>
        )}

        {/* Row preview */}
        <Card>
          <CardHeader><CardTitle>Rows (first 500)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-2">#</th>
                  <th className="pr-2">Date</th>
                  <th className="pr-2">Server</th>
                  <th className="pr-2">Status</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="pr-2 py-1 text-muted-foreground">{r.source_row_index}</td>
                    <td className="pr-2 py-1">{r.service_date ?? "—"}</td>
                    <td className="pr-2 py-1">{r.reported_identity_name ?? "—"}</td>
                    <td className="pr-2 py-1">
                      {r.excluded_from_canonical
                        ? <span className="text-rose-700">rejected</span>
                        : r.reconciliation_status === "duplicate_pending"
                          ? <span className="text-amber-700">duplicate</span>
                          : r.status_reason
                            ? <span className="text-amber-700">warning</span>
                            : <span className="text-emerald-700">accepted</span>}
                    </td>
                    <td className="py-1 text-muted-foreground">{r.status_reason || "—"}</td>
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
