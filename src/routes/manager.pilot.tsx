// Phase 23 — Manager Pilot Readiness page.
//
// Boardroom-ready pilot setup view that reuses the Phase 22 ROI server fn
// (which already enforces requirePaidManagerEntitlement + assertVenueAccess)
// and renders a pilot checklist, measured uplift, modelled remaining
// opportunity and a copyable leadership summary on top.
//
// Hard rules enforced visually:
//   - Measured uplift and modelled opportunity are shown in SEPARATE blocks.
//   - All modelled numbers carry "modelled, not guaranteed" framing.
//   - Adjusted LLS uses applied v1 — OF v2 stays preview only.
//   - Server routes never import this module.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { useVerifyPaidManagerAccess } from "@/hooks/use-verify-paid-manager-access";
import { getRoiReport } from "@/lib/roi.functions";
import {
  buildPilotPackage,
  PILOT_OFFER,
  DEMO_JOURNEY,
  type PilotPackage,
} from "@/lib/pilot/leadership";
import { Rocket, ClipboardCopy, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/manager/pilot")({
  component: () => (
    <PaidManagerGate feature="reports">
      <Page />
    </PaidManagerGate>
  ),
});

function toISO(d: Date): string { return d.toISOString().slice(0, 10); }
function defaultPeriods() {
  const today = new Date();
  const currentEnd = new Date(today);
  const currentStart = new Date(today); currentStart.setDate(currentStart.getDate() - 28);
  const baselineEnd = new Date(currentStart);
  const baselineStart = new Date(currentStart); baselineStart.setDate(baselineStart.getDate() - 28);
  return {
    baselineStart: toISO(baselineStart), baselineEnd: toISO(baselineEnd),
    currentStart: toISO(currentStart), currentEnd: toISO(currentEnd),
  };
}

function Page() {
  const active = useActiveVenue();
  useVerifyPaidManagerAccess();
  const fetchRoi = useServerFn(getRoiReport);
  const [periods, setPeriods] = useState(defaultPeriods);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roi, setRoi] = useState<Awaited<ReturnType<typeof getRoiReport>> | null>(null);
  const venueId = active.venueId;

  useEffect(() => {
    if (active.status !== "ready" || !venueId) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetchRoi({ data: { venueId, ...periods } })
      .then((d) => { if (!cancelled) setRoi(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load pilot data"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active.status, venueId, periods, fetchRoi]);

  const pkg: PilotPackage | null = useMemo(() => {
    if (!roi) return null;
    return buildPilotPackage({
      venueName: roi.period.venueName,
      baselineLabel: `${roi.period.baselineStart} → ${roi.period.baselineEnd}`,
      currentLabel: `${roi.period.currentStart} → ${roi.period.currentEnd}`,
      report: roi.report,
      nextAction: "Book the next Revenue Gap Audit and continue the 30-day pilot review rhythm.",
    });
  }, [roi]);

  if (active.status !== "ready") {
    return <ManagerLayout><div className="p-6"><NoVenueState status={active.status} venues={active.venues} /></div></ManagerLayout>;
  }

  return (
    <ManagerLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <Rocket className="h-6 w-6 mt-1 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold">Pilot Readiness</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Set up a defensible PoppOff pilot. Measured improvement and modelled remaining
              opportunity are shown separately. Modelled numbers are <strong>not guaranteed revenue</strong>.
            </p>
          </div>
        </header>

        {/* Period controls */}
        <section className="rounded-xl border border-border bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <PeriodPicker label="Baseline period" start={periods.baselineStart} end={periods.baselineEnd}
            onChange={(s, e) => setPeriods((p) => ({ ...p, baselineStart: s, baselineEnd: e }))} />
          <PeriodPicker label="Current period" start={periods.currentStart} end={periods.currentEnd}
            onChange={(s, e) => setPeriods((p) => ({ ...p, currentStart: s, currentEnd: e }))} />
        </section>

        {loading && <div className="text-sm text-muted-foreground">Loading pilot readiness…</div>}
        {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        {pkg && roi && (
          <>
            {/* Readiness scorecard */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Pilot setup checklist</h2>
                <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                  pkg.checklist.readinessLevel === "ready" ? "bg-emerald-100 text-emerald-800"
                  : pkg.checklist.readinessLevel === "almost" ? "bg-amber-100 text-amber-900"
                  : "bg-rose-100 text-rose-800"
                }`}>
                  {pkg.checklist.readinessLevel.replace("_", " ").toUpperCase()} ({pkg.checklist.readinessScore}/100)
                </span>
              </div>
              {pkg.checklist.groups.map((g) => (
                <div key={g.title} className="mt-4">
                  <div className="text-sm font-medium mb-2">{g.title}</div>
                  <ul className="space-y-1.5 text-sm">
                    {g.items.map((it) => (
                      <li key={it.id} className="flex items-start gap-2">
                        {it.status === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />}
                        {it.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
                        {it.status === "missing" && <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />}
                        <div>
                          <div>{it.label} {it.optional && <span className="text-xs text-muted-foreground">(optional / contextual)</span>}</div>
                          <div className="text-xs text-muted-foreground">{it.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            {/* Measured uplift — STRICTLY separated from modelled opportunity */}
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
              <h2 className="text-lg font-semibold mb-2 text-emerald-900">Measured improvement already achieved</h2>
              <p className="text-xs text-emerald-900/80 mb-3">From measured POS, labour and identity data. Baseline → current. Not a projection.</p>
              {!pkg.measuredUplift.hasImprovement && pkg.measuredUplift.regressionLines.length === 0 && (
                <p className="text-sm text-muted-foreground">No material movement detected between baseline and current.</p>
              )}
              {pkg.measuredUplift.improvementLines.length > 0 && (
                <ul className="text-sm space-y-1">
                  {pkg.measuredUplift.improvementLines.map((l) => <li key={l}>✓ {l}</li>)}
                </ul>
              )}
              {pkg.measuredUplift.regressionLines.length > 0 && (
                <ul className="text-sm space-y-1 mt-2 text-rose-900">
                  {pkg.measuredUplift.regressionLines.map((l) => <li key={l}>✗ {l}</li>)}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-5">
              <h2 className="text-lg font-semibold mb-2 text-sky-900">Modelled remaining opportunity</h2>
              <p className="text-xs text-sky-900/80 mb-3">
                Modelled, <strong>not guaranteed revenue</strong>. Derived from measured RPC gap and a transparent recoverability factor.
              </p>
              {pkg.modelledOpportunity.noGap ? (
                <p className="text-sm">Current RPC already meets or exceeds baseline RPC — no modelled gap remaining for this period.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <Tile label="Period (modelled)" value={`£${Math.round(pkg.modelledOpportunity.modelledRecoverableRevenuePeriod).toLocaleString()}`} />
                  <Tile label="Monthly (modelled)" value={`£${Math.round(pkg.modelledOpportunity.modelledRecoverableRevenueMonthly).toLocaleString()}`} />
                  <Tile label="Recoverability factor" value={`${(pkg.modelledOpportunity.recoverabilityFactor * 100).toFixed(0)}%`} />
                </div>
              )}
            </section>

            {/* Key metrics + success criteria */}
            <section className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-lg font-semibold mb-3">Key metrics to watch & success criteria</h2>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium mb-1">Key metrics</div>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    <li>RPC (revenue per cover) — sustained improvement vs baseline</li>
                    <li>RPH (revenue per hour) — labour leverage trend</li>
                    <li>Base LLS and Adjusted LLS (applied v1)</li>
                    <li>Data confidence level and reductions</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Success criteria</div>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    {PILOT_OFFER.successLooks.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              </div>
              <div className="mt-4 text-sm">
                <div className="font-medium mb-1">Recommended weekly review rhythm</div>
                <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
                  <li>Monday — re-import last week's POS &amp; labour data, resolve identity warnings.</li>
                  <li>Wednesday — review weekly priorities &amp; menu intelligence, approve what reaches servers.</li>
                  <li>Friday — review LLS &amp; Enterprise ROI movement, log pilot notes.</li>
                </ol>
              </div>
            </section>

            {/* Leadership summary */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">Leadership summary (copyable)</h2>
                <button
                  onClick={() => { navigator.clipboard?.writeText(pkg.leadershipSummary).catch(() => {}); }}
                  className="ml-auto inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <ClipboardCopy className="h-4 w-4" /> Copy
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-sm bg-muted/40 rounded-md p-3 border border-border">{pkg.leadershipSummary}</pre>
            </section>
          </>
        )}

        {/* Pilot offer framing */}
        <section className="rounded-xl border border-border bg-white p-5">
          <h2 className="text-lg font-semibold mb-1">{PILOT_OFFER.title}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            A focused 30-day pilot using the trusted PoppOff foundation. Measured POS &amp; labour data only — contextual data is not used for hard scoring unless verified.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <OfferCol title="The venue provides" items={PILOT_OFFER.venueProvides} />
            <OfferCol title="PoppOff analyses" items={PILOT_OFFER.poppoffAnalyses} />
            <OfferCol title="Managers receive" items={PILOT_OFFER.managersReceive} />
            <OfferCol title="Servers see" items={PILOT_OFFER.serversSee} />
            <OfferCol title="Leadership receives" items={PILOT_OFFER.leadershipReceives} />
            <OfferCol title="What success looks like" items={PILOT_OFFER.successLooks} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
              Book the Revenue Gap Audit <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/manager/roi" className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm hover:bg-muted">
              Open Enterprise ROI report
            </Link>
          </div>
        </section>

        {/* Demo journey reference */}
        <section className="rounded-xl border border-dashed border-border bg-white p-5">
          <h2 className="text-lg font-semibold mb-3">Sales demo journey</h2>
          <ol className="grid md:grid-cols-2 gap-3 text-sm">
            {DEMO_JOURNEY.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{s.number}</span>
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.blurb}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-3">
            See <Link to="/demo/journey" className="underline">/demo/journey</Link> for the full guided demo flow.
          </p>
        </section>
      </div>
    </ManagerLayout>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
function OfferCol({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="font-medium mb-2">{title}</div>
      <ul className="list-disc pl-5 text-muted-foreground space-y-1">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
function PeriodPicker({ label, start, end, onChange }: { label: string; start: string; end: string; onChange: (s: string, e: string) => void }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1"><span className="text-muted-foreground">From</span>
          <input type="date" value={start} onChange={(e) => onChange(e.target.value, end)} className="rounded border border-border px-2 py-1" />
        </label>
        <label className="flex items-center gap-1"><span className="text-muted-foreground">To</span>
          <input type="date" value={end} onChange={(e) => onChange(start, e.target.value)} className="rounded border border-border px-2 py-1" />
        </label>
      </div>
    </div>
  );
}
