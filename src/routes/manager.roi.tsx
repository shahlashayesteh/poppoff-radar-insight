// Phase 22 — Enterprise ROI report page.
//
// Boardroom-ready manager surface that turns trusted PoppOff data into a
// modelled financial case. Hard rules:
//   - Modelled opportunity is labelled modelled, never "guaranteed revenue".
//   - Adjusted LLS movement uses applied v1. OF v2 stays preview-only.
//   - Server routes never import this module or its server functions.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { useVerifyPaidManagerAccess } from "@/hooks/use-verify-paid-manager-access";
import { getRoiReport } from "@/lib/roi.functions";
import { Download, ShieldCheck, AlertTriangle, FileText } from "lucide-react";

export const Route = createFileRoute("/manager/roi")({
  component: () => (
    <PaidManagerGate feature="reports">
      <Page />
    </PaidManagerGate>
  ),
});

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultPeriods() {
  const today = new Date();
  const currentEnd = new Date(today);
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - 28);
  const baselineEnd = new Date(currentStart);
  const baselineStart = new Date(currentStart);
  baselineStart.setDate(baselineStart.getDate() - 28);
  return {
    baselineStart: toISO(baselineStart),
    baselineEnd: toISO(baselineEnd),
    currentStart: toISO(currentStart),
    currentEnd: toISO(currentEnd),
  };
}

const fmtMoney = (n: number | null) =>
  n == null ? "—" : `£${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtNum = (n: number | null, dp = 2) =>
  n == null ? "—" : n.toFixed(dp);

function Page() {
  const active = useActiveVenue();
  useVerifyPaidManagerAccess();
  const fetchRoi = useServerFn(getRoiReport);

  const [periods, setPeriods] = useState(defaultPeriods);
  const [recoverability, setRecoverability] = useState(0.30);
  const [subCost, setSubCost] = useState(199);
  const [implCost, setImplCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof getRoiReport>> | null>(null);

  const venueId = active.venueId;

  useEffect(() => {
    if (active.status !== "ready" || !venueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRoi({
      data: {
        venueId,
        ...periods,
        recoverabilityFactor: recoverability,
        monthlySubscriptionCost: subCost,
        implementationCost: implCost,
      },
    })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load ROI report"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active.status, venueId, periods, recoverability, subCost, implCost, fetchRoi]);

  const confidenceColor = useMemo(() => {
    if (!data) return "bg-muted text-muted-foreground";
    return data.report.confidence.level === "high"
      ? "bg-emerald-100 text-emerald-800"
      : data.report.confidence.level === "medium"
      ? "bg-amber-100 text-amber-800"
      : "bg-rose-100 text-rose-800";
  }, [data]);

  if (active.status !== "ready") {
    return (
      <ManagerLayout>
        <div className="p-6">
          <NoVenueState status={active.status} venues={active.venues} />
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Enterprise ROI</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Boardroom-ready report turning measured POS, labour and identity
              data into a <strong>modelled improvement opportunity</strong>.
              Numbers below are modelled, not guaranteed revenue.
            </p>
          </div>
          {data && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(data.exportSummary).catch(() => {});
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
              title="Copy executive summary"
            >
              <Download className="h-4 w-4" /> Copy executive summary
            </button>
          )}
        </header>

        <section className="rounded-xl border border-border bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <PeriodPicker
            label="Baseline period"
            start={periods.baselineStart}
            end={periods.baselineEnd}
            onChange={(s, e) => setPeriods((p) => ({ ...p, baselineStart: s, baselineEnd: e }))}
          />
          <PeriodPicker
            label="Current period"
            start={periods.currentStart}
            end={periods.currentEnd}
            onChange={(s, e) => setPeriods((p) => ({ ...p, currentStart: s, currentEnd: e }))}
          />
          <div className="space-y-2 text-sm">
            <div className="font-medium">Assumptions</div>
            <label className="flex justify-between gap-2 items-center">
              <span className="text-muted-foreground">Recoverability factor</span>
              <input type="number" min={0} max={1} step={0.05} value={recoverability}
                onChange={(e) => setRecoverability(Number(e.target.value))}
                className="w-20 rounded border border-border px-2 py-1 text-right" />
            </label>
            <label className="flex justify-between gap-2 items-center">
              <span className="text-muted-foreground">Monthly subscription</span>
              <input type="number" min={0} step={1} value={subCost}
                onChange={(e) => setSubCost(Number(e.target.value))}
                className="w-24 rounded border border-border px-2 py-1 text-right" />
            </label>
            <label className="flex justify-between gap-2 items-center">
              <span className="text-muted-foreground">Implementation cost</span>
              <input type="number" min={0} step={1} value={implCost}
                onChange={(e) => setImplCost(Number(e.target.value))}
                className="w-24 rounded border border-border px-2 py-1 text-right" />
            </label>
          </div>
        </section>

        {loading && <div className="text-sm text-muted-foreground">Loading ROI report…</div>}
        {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        {data && (
          <>
            {/* Executive summary */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Executive summary</h2>
                <span className={`ml-auto text-xs px-2 py-1 rounded-full ${confidenceColor}`}>
                  Confidence: {data.report.confidence.level.toUpperCase()} ({data.report.confidence.score}/100)
                </span>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat label="Modelled recoverable revenue (period)" value={fmtMoney(data.report.roi.modelledRecoverableRevenue)} note="Modelled, not guaranteed" />
                <Stat label="Monthly modelled opportunity" value={fmtMoney(data.report.roi.monthlyModelledRecoverableRevenue)} note={`@ ${(data.report.roi.assumptions.recoverabilityFactor * 100).toFixed(0)}% recoverability`} />
                <Stat label="Estimated payback period" value={data.report.roi.paybackMonths == null ? "—" : `${data.report.roi.paybackMonths.toFixed(1)} months`} note="With disclosed assumptions" />
              </dl>
            </section>

            {/* Measured performance */}
            <section className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-lg font-semibold mb-3">Measured performance — baseline vs current</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left py-2">Metric</th>
                      <th className="text-right">Baseline</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">Movement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <MovementRow label="Sales" b={fmtMoney(data.report.movement.baseline.totalSales)} c={fmtMoney(data.report.movement.current.totalSales)} m={fmtPct(data.report.movement.salesPct)} />
                    <MovementRow label="Covers" b={String(data.report.movement.baseline.totalCovers)} c={String(data.report.movement.current.totalCovers)} m="" />
                    <MovementRow label="RPC (Revenue per Cover)" b={fmtMoney(data.report.movement.baseline.rpc)} c={fmtMoney(data.report.movement.current.rpc)} m={fmtPct(data.report.movement.rpcPct)} />
                    <MovementRow label="RPH (Revenue per Hour)" b={fmtMoney(data.report.movement.baseline.rph)} c={fmtMoney(data.report.movement.current.rph)} m={fmtPct(data.report.movement.rphPct)} />
                    <MovementRow label="Base LLS" b={fmtNum(data.report.movement.baseline.baseLls)} c={fmtNum(data.report.movement.current.baseLls)} m={data.report.movement.baseLlsDelta == null ? "—" : data.report.movement.baseLlsDelta.toFixed(2)} />
                    <MovementRow label="Adjusted LLS (applied v1)" b={fmtNum(data.report.movement.baseline.adjustedLls)} c={fmtNum(data.report.movement.current.adjustedLls)} m={data.report.movement.adjustedLlsDelta == null ? "—" : data.report.movement.adjustedLlsDelta.toFixed(2)} />
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Adjusted LLS uses the applied v1 opportunity factor. OF v2 remains preview-only and is not applied here.
              </p>
            </section>

            {/* Data quality + confidence */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Data quality &amp; confidence</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <QualityTile label="Measured inputs" value={data.report.dataQuality.measuredInputs} />
                <QualityTile label="Derived inputs" value={data.report.dataQuality.derivedInputs} />
                <QualityTile label="Estimated inputs" value={data.report.dataQuality.estimatedInputs} tone="amber" />
                <QualityTile label="Contextual excluded" value={data.report.dataQuality.contextualInputsExcluded} />
                <QualityTile label="Blocked / untrusted" value={data.report.dataQuality.blockedOrUntrustedInputs} tone="rose" />
                <QualityTile label="Gross-as-net warnings" value={data.report.dataQuality.grossUsedAsNetWarnings} tone="amber" />
                <QualityTile label="Unknown labour basis" value={data.report.dataQuality.unknownLaborBasisWarnings} tone="amber" />
                <QualityTile label="Identity ambiguity" value={data.report.dataQuality.identityAmbiguityWarnings} tone="rose" />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium mb-1">Why this confidence level</div>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    {data.report.confidence.reasons.map((r) => <li key={r}>{r}</li>)}
                    {data.report.confidence.reasons.length === 0 && <li>No positive confidence drivers detected.</li>}
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Reductions applied
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    {data.report.confidence.reductions.map((r) => <li key={r}>{r}</li>)}
                    {data.report.confidence.reductions.length === 0 && <li>No reductions applied.</li>}
                  </ul>
                </div>
              </div>
            </section>

            {/* ROI assumptions */}
            <section className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-lg font-semibold mb-3">ROI assumptions (transparent)</h2>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Modelled recoverable revenue</strong> = max(0, baseline RPC − current RPC) × current covers × recoverability factor.</li>
                <li><strong>Recoverability factor</strong>: {(data.report.roi.assumptions.recoverabilityFactor * 100).toFixed(0)}% — conservative default 30%.</li>
                <li><strong>Monthly conversion</strong>: scaled from a {data.report.roi.assumptions.weeksInPeriod.toFixed(1)}-week period using 52/12 weeks per month.</li>
                <li><strong>Payback period</strong> = (implementation cost + monthly subscription) ÷ monthly modelled recoverable revenue.</li>
                <li><strong>OF v2</strong>: preview only — applied LLS still uses v1.</li>
                <li>Unverified section, rota section, weather and manager notes are excluded from scoring.</li>
              </ul>
            </section>

            {/* Pilot outcome / export block */}
            <section className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-lg font-semibold mb-3">Export-ready pilot summary</h2>
              <pre className="whitespace-pre-wrap text-sm bg-muted/40 rounded-md p-3 border border-border">
{data.exportSummary}
              </pre>
            </section>
          </>
        )}
      </div>
    </ManagerLayout>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {note && <div className="text-xs text-muted-foreground mt-1">{note}</div>}
    </div>
  );
}

function MovementRow({ label, b, c, m }: { label: string; b: string; c: string; m: string }) {
  return (
    <tr>
      <td className="py-2">{label}</td>
      <td className="text-right">{b}</td>
      <td className="text-right font-medium">{c}</td>
      <td className="text-right text-muted-foreground">{m}</td>
    </tr>
  );
}

function QualityTile({ label, value, tone }: { label: string; value: number; tone?: "amber" | "rose" }) {
  const toneClass =
    tone === "amber" ? "bg-amber-50 text-amber-900 border-amber-200" :
    tone === "rose" ? "bg-rose-50 text-rose-900 border-rose-200" :
    "bg-muted/40 text-foreground border-border";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-xs">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function PeriodPicker({
  label, start, end, onChange,
}: { label: string; start: string; end: string; onChange: (s: string, e: string) => void }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">{label}</div>
      <label className="flex justify-between gap-2 items-center">
        <span className="text-muted-foreground">From</span>
        <input type="date" value={start} onChange={(e) => onChange(e.target.value, end)}
          className="rounded border border-border px-2 py-1" />
      </label>
      <label className="flex justify-between gap-2 items-center">
        <span className="text-muted-foreground">To</span>
        <input type="date" value={end} onChange={(e) => onChange(start, e.target.value)}
          className="rounded border border-border px-2 py-1" />
      </label>
    </div>
  );
}
