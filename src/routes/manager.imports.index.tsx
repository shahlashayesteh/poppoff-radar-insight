// Phase 6 — Import batch list. Manager-only.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listImportBatches } from "@/lib/imports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManagerLayout } from "@/components/manager-layout";
import { useEntitlement, statusLabel } from "@/lib/entitlements";

import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { NoVenueState } from "@/components/manager/no-venue-state";

export const Route = createFileRoute("/manager/imports/")({
  component: () => (
    <PaidManagerGate feature="imports">
      <ImportsListPage />
    </PaidManagerGate>
  ),
});

type Batch = {
  id: string;
  source_kind: string;
  source_filename: string | null;
  source_system: string | null;
  status: string;
  row_count: number;
  accepted_count: number;
  rejected_count: number;
  warning_count: number;
  gross_total: number | null;
  net_total: number | null;
  labour_total: number | null;
  covers_total: number | null;
  created_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  staged: "bg-slate-200 text-slate-800",
  needs_review: "bg-amber-200 text-amber-900",
  approved: "bg-blue-200 text-blue-900",
  committed: "bg-emerald-200 text-emerald-900",
  rolled_back: "bg-slate-300 text-slate-700",
  failed: "bg-rose-200 text-rose-900",
};

function ImportsListPage() {
  const fetchList = useServerFn(listImportBatches);
  const entitlement = useEntitlement();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchList()
      .then((r) => setBatches((r.batches ?? []) as Batch[]))
      .catch((e) => setErr(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [fetchList]);

  return (
    <ManagerLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Imports</h1>
          <p className="text-sm text-muted-foreground">
            Every uploaded file is staged here. Review the Data Quality panel for each batch, then approve and commit
            before it affects LLS.
          </p>
        </header>

        {!entitlement.loading && !entitlement.canImport && (
          <div
            role="alert"
            data-testid="import-blocked-banner"
            className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            Production imports are disabled — subscription status is <strong>{statusLabel(entitlement.status)}</strong>.
            Existing batches remain readable, but new files cannot be staged or committed until billing is active.
          </div>
        )}
        {entitlement.showPastDueWarning && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Your subscription is past due. Imports continue to work during the grace period — update billing to avoid interruption.
          </div>
        )}

        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {err && <div className="text-sm text-rose-600">{err}</div>}
        {!loading && !err && batches.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No imports yet. Upload a sales or labour file from <Link to="/manager/lls" className="underline">LLS</Link>.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {batches.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold">
                    <Link to="/manager/imports/$batchId" params={{ batchId: b.id }} className="hover:underline">
                      {b.source_filename || "(no filename)"}
                    </Link>
                  </CardTitle>
                  <Badge className={STATUS_COLORS[b.status] ?? "bg-slate-200 text-slate-800"}>
                    {b.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.source_kind} · {b.source_system ?? "unknown source"} · {new Date(b.created_at).toLocaleString()}
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Stat label="Rows" value={b.row_count} />
                <Stat label="Accepted" value={b.accepted_count} tone="ok" />
                <Stat label="Warnings" value={b.warning_count} tone="warn" />
                <Stat label="Rejected" value={b.rejected_count} tone="bad" />
                {b.gross_total != null && <Stat label="Gross" value={`£${Math.round(b.gross_total).toLocaleString()}`} />}
                {b.net_total != null && <Stat label="Net" value={`£${Math.round(b.net_total).toLocaleString()}`} />}
                {b.labour_total != null && <Stat label="Labour" value={`£${Math.round(b.labour_total).toLocaleString()}`} />}
                {b.covers_total != null && <Stat label="Covers" value={b.covers_total} />}
              </CardContent>
            </Card>
          ))}
        </div>
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
