// Imports Hub — single central place for every manager upload.
// All upload paths route through the existing guarded server functions
// (stageImport / stageMenuImport). The hub never writes to canonical
// tables from the browser. Manager approval is still required inside
// /manager/imports/$batchId before staged rows reach LLS / Reports / ROI
// / Shift Match Planner, and inside Menu Intelligence before menu
// suggestions reach servers.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  listImportBatches,
  stageImport,
  stageMenuImport,
} from "@/lib/imports.functions";
import {
  detectColumns,
  type CanonicalField,
} from "@/lib/import/column-intelligence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagerLayout } from "@/components/manager-layout";
import { useEntitlement, statusLabel } from "@/lib/entitlements";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { NoVenueState } from "@/components/manager/no-venue-state";
import {
  Upload,
  FileSpreadsheet,
  Users,
  BookOpen,
  CalendarRange,
  Utensils,
  Lock,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/manager/imports/")({
  component: () => (
    <PaidManagerGate feature="imports">
      <ImportsHubPage />
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

// -------------------------------------------------------------------
// Lightweight in-browser parsing for the hub. Anything ambiguous (mapping
// required) is handed off to /manager/lls which already owns the column-
// mapping UI. We never write to canonical tables here.
// -------------------------------------------------------------------
type Parsed = { headers: string[]; rows: Record<string, any>[]; filename: string; text?: string };

async function parseFile(file: File): Promise<Parsed> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows, filename: file.name };
  }
  const text = await file.text();
  const result = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
  return { headers: result.meta.fields ?? [], rows: result.data, filename: file.name, text };
}

function normaliseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const uk = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (uk) {
    const yr = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${yr}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNumber(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[£$,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const REQUIRED_FOR: Record<"sales" | "labor", CanonicalField[]> = {
  sales: ["server_name", "shift_date"],
  labor: ["server_name", "shift_date"],
};

function buildRowsForSource(
  parsed: Parsed,
  source: "sales" | "labor",
  headerToField: Record<string, CanonicalField | null>,
): { rows: any[]; missing: CanonicalField[] } {
  const fieldHeader: Partial<Record<CanonicalField, string>> = {};
  for (const [h, f] of Object.entries(headerToField)) if (f) fieldHeader[f] = h;
  const missing = REQUIRED_FOR[source].filter((f) => !fieldHeader[f]);
  if (missing.length) return { rows: [], missing };

  const out: any[] = [];
  for (const r of parsed.rows) {
    const get = (f: CanonicalField) => (fieldHeader[f] ? r[fieldHeader[f]!] : null);
    const date = normaliseDate(get("shift_date"));
    const name = String(get("server_name") ?? "").trim();
    if (!date || !name) continue;
    const base: any = {
      server_name: name,
      server_id: get("employee_id") ? String(get("employee_id")) : null,
      shift_date: date,
      outlet: get("outlet") ? String(get("outlet")) : null,
      revenue_centre: get("revenue_centre") ? String(get("revenue_centre")) : null,
    };
    if (source === "sales") {
      base.gross_sales = toNumber(get("gross_sales"));
      base.net_sales = toNumber(get("net_sales"));
      base.covers_served = toNumber(get("covers_served"));
    } else {
      let labor = toNumber(get("labor_cost"));
      if (labor == null) {
        const h = toNumber(get("hours_worked"));
        const rate = toNumber(get("hourly_rate"));
        if (h != null && rate != null) labor = h * rate;
      }
      base.labor_cost = labor;
      base.hours_worked = toNumber(get("hours_worked"));
    }
    out.push(base);
  }
  return { rows: out, missing: [] };
}

// -------------------------------------------------------------------

function ImportsHubPage() {
  const fetchList = useServerFn(listImportBatches);
  const stage = useServerFn(stageImport);
  const stageMenu = useServerFn(stageMenuImport);
  const entitlement = useEntitlement();
  const active = useActiveVenue();
  const venueId = active.venueId ?? undefined;
  const navigate = useNavigate();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    if (!venueId) return;
    setLoading(true);
    fetchList({ data: { venueId } })
      .then((r) => setBatches((r.batches ?? []) as Batch[]))
      .catch((e) => setErr(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [fetchList, venueId]);

  if (active.status !== "ready") {
    return (
      <ManagerLayout>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <NoVenueState status={active.status} venues={active.venues} />
        </div>
      </ManagerLayout>
    );
  }

  // Generic upload handler for sales / labor / combined.
  async function handleShiftUpload(file: File, kinds: Array<"sales" | "labor">) {
    if (!venueId) return;
    if (!entitlement.canImport) {
      toast.error("Imports are disabled — subscription is not active.");
      return;
    }
    setBusy(file.name);
    try {
      const parsed = await parseFile(file);
      if (!parsed.headers.length) throw new Error("Could not read file headers");
      const det = detectColumns(parsed.headers, { sampleRows: parsed.rows.slice(0, 25) });

      let lastBatchId: string | null = null;
      const stagedKinds: string[] = [];
      const handoff: Array<"sales" | "labor"> = [];

      for (const kind of kinds) {
        const built = buildRowsForSource(parsed, kind, det.headerToField);
        if (built.missing.length || built.rows.length === 0) {
          handoff.push(kind);
          continue;
        }
        const res = await stage({
          data: {
            sourceKind: kind,
            filename: parsed.filename,
            rows: built.rows,
            venueId,
          },
        });
        lastBatchId = (res as any)?.batchId ?? (res as any)?.batch?.id ?? lastBatchId;
        stagedKinds.push(kind);
      }

      if (stagedKinds.length) {
        toast.success(
          `Staged ${stagedKinds.join(" + ")} from ${file.name}. Review before commit.`,
        );
        refresh();
        if (lastBatchId) navigate({ to: "/manager/imports/$batchId", params: { batchId: lastBatchId } });
      }
      if (handoff.length) {
        toast.warning(
          `${file.name}: column mapping required for ${handoff.join(" + ")}. Finish in Labor Leverage.`,
        );
        navigate({ to: "/manager/lls" });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleMenuUpload(file: File) {
    if (!venueId) return;
    setBusy(file.name);
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("Menu file is empty");
      await stageMenu({
        data: { filename: file.name, menuText: text, venueId },
      });
      toast.success(
        `Menu staged from ${file.name}. Review suggestions in Menu Intelligence before they reach servers.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Menu upload failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ManagerLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Imports</h1>
            {active.venueName && (
              <Badge variant="outline" className="text-xs">
                Active venue: {active.venueName}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Upload all restaurant data here once. PoppOff will validate it, stage it, and route it to the right
            parts of the manager app. Nothing reaches LLS, Reports, ROI, the Shift Match Planner, or your servers
            until you review and approve it.
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

        {/* ---------- Upload cards ---------- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upload your data
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <UploadCard
              testId="upload-pos-sales"
              icon={<FileSpreadsheet className="h-5 w-5 text-emerald-600" />}
              title="POS Sales"
              required
              powers="LLS · Reports · Enterprise ROI · Pilot Readiness · Shift Match Planner · Dashboard"
              description="POS sales summary, check-level sales, server sales export, item sales."
              accept=".csv,.xlsx,.xls"
              busy={busy}
              disabled={!entitlement.canImport}
              onFile={(f) => handleShiftUpload(f, ["sales"])}
            />
            <UploadCard
              testId="upload-labour"
              icon={<Users className="h-5 w-5 text-sky-600" />}
              title="Labour / Timeclock"
              required
              powers="LLS · ROI · Shift Match Planner · Data Onboarding · labour basis confidence"
              description="Timeclock export, labour hours, wage/labour cost."
              accept=".csv,.xlsx,.xls"
              busy={busy}
              disabled={!entitlement.canImport}
              onFile={(f) => handleShiftUpload(f, ["labor"])}
            />
            <UploadCard
              testId="upload-combined"
              icon={<Upload className="h-5 w-5 text-violet-600" />}
              title="Combined Sales + Labour"
              powers="Stages both sides from a single file (pilot / testing)."
              description="One CSV containing both sales and labour columns. We stage each side separately for review."
              accept=".csv,.xlsx,.xls"
              busy={busy}
              disabled={!entitlement.canImport}
              onFile={(f) => handleShiftUpload(f, ["sales", "labor"])}
            />
            <UploadCard
              testId="upload-menu"
              icon={<BookOpen className="h-5 w-5 text-amber-600" />}
              title="Menu"
              powers="Menu Intelligence · Weekly Priorities · server menu tips (after approval)"
              description="Menu items, categories, prices, margins. AI parsing and suggestions stay manager-only until you approve them."
              accept=".csv,.txt,.md"
              busy={busy}
              disabled={!entitlement.canImport}
              onFile={(f) => handleMenuUpload(f)}
            />
            <UploadCard
              testId="upload-legacy-stats"
              icon={<FileSpreadsheet className="h-5 w-5 text-slate-600" />}
              title="Legacy Weekly Server Stats"
              powers="Dashboard · Server Stats · Server Leaderboard"
              description="Older weekly scorecard / category stats CSV. Use only for the legacy dashboard pathway — not for LLS shift imports."
              footer={
                <Button asChild size="sm" variant="outline">
                  <Link to="/manager">
                    Open Dashboard <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              }
              busy={null}
              disabled
            />
            <UploadCard
              testId="upload-rota"
              icon={<CalendarRange className="h-5 w-5 text-slate-500" />}
              title="Rota / Schedule"
              contextOnly
              powers="Shift Match Planner (context) · Data Onboarding labels"
              description="Coming soon: rota context upload. Current Shift Match Planner uses historical worked shifts only."
              busy={null}
              disabled
            />
            <UploadCard
              testId="upload-reservations"
              icon={<Utensils className="h-5 w-5 text-slate-500" />}
              title="Reservations (SevenRooms etc.)"
              contextOnly
              powers="Context labels only — never hard scoring unless verified."
              description="Coming soon: reservation context upload. Section / table allocation will not power confident scoring unless verified."
              busy={null}
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Need column-mapping help? Files that don't auto-detect required columns will hand off to{" "}
            <Link to="/manager/lls" className="underline">Labor Leverage</Link>, which owns the mapping wizard.
          </p>
        </section>

        {/* ---------- Pending review ---------- */}
        <PendingReviewSection batches={batches} loading={loading} />

        {/* ---------- Batch history ---------- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Batch history
          </h2>
          {err && <div className="text-sm text-rose-600">{err}</div>}
          {!loading && !err && batches.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No imports yet. Upload your first POS sales or labour file above.
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
        </section>
      </div>
    </ManagerLayout>
  );
}

function PendingReviewSection({ batches, loading }: { batches: Batch[]; loading: boolean }) {
  const pending = batches.filter((b) => ["staged", "needs_review", "approved"].includes(b.status));
  if (loading || pending.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Pending review ({pending.length})
      </h2>
      <Card className="border-amber-300 bg-amber-50/60">
        <CardContent className="py-3 text-sm space-y-1">
          {pending.slice(0, 5).map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <Link to="/manager/imports/$batchId" params={{ batchId: b.id }} className="underline">
                  {b.source_filename || "(no filename)"}
                </Link>{" "}
                — {b.source_kind} · {b.accepted_count} accepted · {b.warning_count} warnings
              </span>
              <Badge variant="outline" className="text-xs">{b.status.replace(/_/g, " ")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

type UploadCardProps = {
  testId: string;
  icon: React.ReactNode;
  title: string;
  powers: string;
  description: string;
  required?: boolean;
  contextOnly?: boolean;
  accept?: string;
  busy: string | null;
  disabled?: boolean;
  onFile?: (file: File) => void;
  footer?: React.ReactNode;
};

function UploadCard({
  testId, icon, title, powers, description,
  required, contextOnly, accept, busy, disabled, onFile, footer,
}: UploadCardProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Card data-testid={testId} className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <div className="flex gap-1">
            {required && <Badge className="bg-emerald-100 text-emerald-900 text-[10px]">Required</Badge>}
            {contextOnly && <Badge className="bg-amber-100 text-amber-900 text-[10px]">Context only</Badge>}
            {!required && !contextOnly && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 text-xs">
        <p className="text-muted-foreground">{description}</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground/80">Powers: </span>{powers}
        </p>
        <div className="mt-auto">
          {footer ? (
            footer
          ) : onFile && !disabled ? (
            <>
              <input
                ref={ref}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  if (ref.current) ref.current.value = "";
                }}
              />
              <Button
                size="sm"
                onClick={() => ref.current?.click()}
                disabled={busy != null}
              >
                <Upload className="mr-1 h-3 w-3" />
                {busy ? "Uploading…" : "Choose file"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <Lock className="mr-1 h-3 w-3" />
              {contextOnly ? "Coming soon" : "Unavailable"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
