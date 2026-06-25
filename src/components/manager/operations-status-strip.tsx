// Phase 9 — Manager Operations Status Strip.
// Surfaces import quality, identity quality, and LLS basis confidence on
// manager pages. Manager-only — never imported by /server/* routes.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listImportBatches } from "@/lib/imports.functions";
import { CheckCircle2, AlertTriangle, Inbox, ShieldAlert, Database } from "lucide-react";

type Batch = {
  id: string;
  status: string;
  source_filename: string | null;
  source_system: string | null;
  row_count: number;
  accepted_count: number;
  rejected_count: number;
  warning_count: number;
  created_at: string;
  committed_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  staged: "bg-slate-100 text-slate-700 border-slate-300",
  needs_review: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-blue-100 text-blue-800 border-blue-300",
  committed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rolled_back: "bg-zinc-100 text-zinc-600 border-zinc-300",
  failed: "bg-rose-100 text-rose-800 border-rose-300",
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {children}
    </span>
  );
}

export function OperationsStatusStrip() {
  const fetchList = useServerFn(listImportBatches);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchList()
      .then((r) => {
        if (cancelled) return;
        setBatches((r.batches ?? []) as Batch[]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load import status");
        setBatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  if (batches === null) {
    return null; // do not flash placeholder
  }

  const pending = batches.filter(
    (b) => b.status === "staged" || b.status === "needs_review" || b.status === "approved",
  );
  const failed = batches.filter((b) => b.status === "failed");
  const latest = batches[0] ?? null;
  const latestStatusTone = latest ? STATUS_TONE[latest.status] ?? STATUS_TONE.staged : STATUS_TONE.staged;

  const dataQualityTone =
    failed.length > 0
      ? "border-rose-300 bg-rose-50"
      : pending.length > 0
        ? "border-amber-300 bg-amber-50"
        : latest && latest.status === "committed"
          ? "border-emerald-300 bg-emerald-50"
          : "border-border bg-muted/40";

  return (
    <section
      data-testid="manager-operations-status-strip"
      className={`mt-4 rounded-2xl border p-4 ${dataQualityTone}`}
      aria-label="Operations status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Database className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-foreground/80">
              Operations status
            </div>
            <div className="mt-1 text-xs text-muted-foreground max-w-2xl">
              Import quality, identity quality and basis confidence for the data feeding LLS, Team and Reports.
              <span className="ml-1">Modelled values are labelled <em>modelled</em>; estimated values are labelled <em>estimated</em>; nothing here implies guaranteed revenue.</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/manager/imports"
            className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1"
          >
            <Inbox className="h-3.5 w-3.5" /> Open imports
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-rose-700">{error}</div>
      )}

      {batches.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">
          No imports yet. Manager metrics will use existing rows only. Upload via{" "}
          <Link to="/manager/lls" className="underline">LLS</Link> to feed the staging pipeline.
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {latest && (
            <span className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">Latest import</span>
              <Pill tone={latestStatusTone}>{latest.status.replace(/_/g, " ")}</Pill>
              <span className="text-foreground/80">
                {latest.source_filename ?? latest.source_system ?? "uploaded file"} · {latest.accepted_count}/{latest.row_count} accepted
              </span>
            </span>
          )}
          {pending.length > 0 && (
            <Pill tone="bg-amber-100 text-amber-800 border-amber-300">
              <AlertTriangle className="h-3 w-3" /> {pending.length} pending review
            </Pill>
          )}
          {failed.length > 0 && (
            <Pill tone="bg-rose-100 text-rose-800 border-rose-300">
              <ShieldAlert className="h-3 w-3" /> {failed.length} failed
            </Pill>
          )}
          {latest && latest.warning_count > 0 && (
            <Pill tone="bg-amber-50 text-amber-700 border-amber-200">
              {latest.warning_count} warnings
            </Pill>
          )}
          {latest && latest.rejected_count > 0 && (
            <Pill tone="bg-rose-50 text-rose-700 border-rose-200">
              {latest.rejected_count} rejected
            </Pill>
          )}
          {latest && latest.status === "committed" && (
            <Pill tone="bg-emerald-100 text-emerald-800 border-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> Identity & basis checks passed at commit
            </Pill>
          )}
        </div>
      )}

      <ProvenanceLegend />
    </section>
  );
}

export function ProvenanceLegend() {
  return (
    <div
      data-testid="provenance-legend"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground"
    >
      <span className="font-semibold uppercase tracking-wider text-foreground/70">How to read values:</span>
      <span><strong className="text-foreground/80">Measured</strong> — uploaded by you</span>
      <span><strong className="text-foreground/80">Derived</strong> — calculated from your data</span>
      <span><strong className="text-foreground/80">Estimated</strong> — inferred where data was incomplete</span>
      <span><strong className="text-foreground/80">Modelled</strong> — projected impact, not guaranteed revenue</span>
    </div>
  );
}
