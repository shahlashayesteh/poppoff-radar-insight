// Phase 25 — Manager Data Onboarding & Export Templates page.
//
// Operator-facing onboarding that explains exactly which data PoppOff
// needs from existing restaurant systems, separates required / optional /
// contextual fields, offers downloadable CSV templates, documents source
// systems, surfaces a live readiness score, and gives plain-language
// import mapping help.
//
// Hard rules enforced visually:
//   - Required, optional and contextual fields shown in separate sections.
//   - Section / rota / reservation data labelled CONTEXT ONLY.
//   - No LLS, ROI, provenance or OF v2 numbers rendered here.
//   - Server routes never import this module.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { useVerifyPaidManagerAccess } from "@/hooks/use-verify-paid-manager-access";
import {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  CONTEXTUAL_FIELDS,
  TEMPLATES,
  SOURCE_SYSTEM_GUIDE,
  IMPORT_MAPPING_HELP,
  templateToCsv,
  evaluateReadiness,
  type OnboardingField,
  type ReadinessResult,
  type ReadinessSignals,
} from "@/lib/onboarding/data-onboarding";
import { getDataReadiness } from "@/lib/onboarding.functions";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Database,
  Info,
  ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/manager/data-onboarding")({
  component: () => (
    <PaidManagerGate feature="data onboarding">
      <Page />
    </PaidManagerGate>
  ),
});

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function levelBadge(level: ReadinessResult["level"]) {
  switch (level) {
    case "strong":
      return { className: "bg-emerald-100 text-emerald-800", label: "Ready for strong scoring" };
    case "warning":
      return { className: "bg-amber-100 text-amber-800", label: "Ready with warnings" };
    case "context_only":
      return { className: "bg-sky-100 text-sky-800", label: "Context only" };
    case "insufficient":
      return { className: "bg-rose-100 text-rose-800", label: "Not enough data" };
  }
}

function Page() {
  const active = useActiveVenue();
  useVerifyPaidManagerAccess();
  const fetchReadiness = useServerFn(getDataReadiness);
  const [readiness, setReadiness] = useState<{
    signals: ReadinessSignals;
    result: ReadinessResult;
    sampleSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const venueId = active.venueId;
  useEffect(() => {
    if (active.status !== "ready" || !venueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReadiness({ data: { venueId } })
      .then((d) => { if (!cancelled) setReadiness(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load readiness."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active.status, venueId, fetchReadiness]);

  // Fallback "empty venue" readiness for first-time operators.
  const fallback = useMemo(
    () => evaluateReadiness({
      hasServerIdentity: false,
      hasSalesByServer: false,
      hasTimestamps: false,
      hasLabourHours: false,
      hasKnownSalesBasis: false,
      hasKnownLabourBasis: false,
      hasItemOrCategory: false,
      sectionsVerified: false,
      onlyRotaOrReservation: true,
    }),
    [],
  );

  if (active.status !== "ready") {
    return (
      <ManagerLayout>
        <div className="p-6"><NoVenueState status={active.status} venues={active.venues} /></div>
      </ManagerLayout>
    );
  }

  const result = readiness?.result ?? fallback;
  const badge = levelBadge(result.level);

  return (
    <ManagerLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        <header className="flex items-start gap-3">
          <Database className="h-6 w-6 mt-1 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold">Data Onboarding</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              The more measured data you provide, the stronger the recommendations.
              PoppOff treats POS and labour data as hard truth, and treats rota,
              section and reservation data as context only unless explicitly verified.
            </p>
          </div>
        </header>

        {/* Readiness */}
        <section className="border rounded-lg p-5 bg-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> Data readiness
            </h2>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          {loading && <p className="text-sm text-muted-foreground mt-2">Checking your data…</p>}
          {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
          <p className="text-sm mt-3">{result.headline}</p>

          <ul className="mt-4 grid sm:grid-cols-2 gap-2">
            {result.checklist.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                ) : c.required ? (
                  <XCircle className="h-4 w-4 text-rose-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                )}
                <span>
                  {c.label}{" "}
                  {c.required ? (
                    <span className="text-[11px] text-muted-foreground">(required)</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">(optional)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {result.warnings.length > 0 && (
            <div className="mt-4 p-3 rounded bg-amber-50 border border-amber-200">
              <p className="text-xs font-medium text-amber-900 mb-1">Warnings</p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-amber-900">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {readiness && (
            <p className="text-[11px] text-muted-foreground mt-3">
              Based on the last {readiness.sampleSize} shift rows for this venue.
            </p>
          )}
        </section>

        {/* Fields */}
        <FieldsSection title="Required for strong scoring" fields={REQUIRED_FIELDS} tone="required" />
        <FieldsSection title="Useful but optional" fields={OPTIONAL_FIELDS} tone="optional" />
        <FieldsSection
          title="Context only — unless verified"
          fields={CONTEXTUAL_FIELDS}
          tone="contextual"
          footnote="Section, table allocation, rota role, reservation type, walk-in vs booking, manager notes and weather are treated as context only unless an operator explicitly verifies them. PoppOff will not use them as hard scoring inputs."
        />

        {/* Templates */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Export templates</h2>
          <p className="text-sm text-muted-foreground">
            Download a CSV header + one sample row per template. Match your existing
            POS / labour exports to these columns.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATES.map((t) => (
              <div key={t.id} className="border rounded-lg p-4 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {t.title}
                      {t.required && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 uppercase">
                          required
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 border rounded hover:bg-muted shrink-0"
                    onClick={() => downloadCsv(`poppoff-${t.id}-template.csv`, templateToCsv(t))}
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                </div>
                <table className="text-xs mt-3 w-full">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left font-medium">Column</th><th className="text-left font-medium">Required</th><th className="text-left font-medium">Reliability</th></tr>
                  </thead>
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.name} className="border-t">
                        <td className="py-1 pr-2 font-mono">{c.name}</td>
                        <td className="py-1 pr-2">{c.required ? "yes" : "no"}</td>
                        <td className="py-1 pr-2 capitalize">{c.reliability}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        {/* Source system guide */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Source system guide</h2>
          <p className="text-sm text-muted-foreground">
            Quick reference for the systems PoppOff already understands. We do not
            integrate deeply yet — this explains how exported data from each
            system is treated.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {SOURCE_SYSTEM_GUIDE.map((s) => (
              <div key={s.id} className="border rounded-lg p-4 bg-card text-sm">
                <h3 className="font-semibold">{s.title}</h3>
                <Bucket label="Trusted (measured)" items={s.trusted} tone="emerald" />
                <Bucket label="Derived" items={s.derived} tone="sky" />
                <Bucket label="Estimated (with warnings)" items={s.estimated} tone="amber" />
                <Bucket label="Contextual (colour only)" items={s.contextual} tone="slate" />
                <Bucket label="Not used for hard scoring" items={s.notUsedForScoring} tone="rose" />
              </div>
            ))}
          </div>
        </section>

        {/* Import mapping help */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Info className="h-5 w-5" /> Import mapping help
          </h2>
          <p className="text-sm text-muted-foreground">
            Reference labels you'll see in the import flow. Each mapped field
            says what it means, how reliable it is, and whether it feeds scoring.
          </p>
          <table className="w-full text-sm border rounded overflow-hidden">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="p-2">Field</th>
                <th className="p-2">Reliability</th>
                <th className="p-2">Feeds scoring?</th>
                <th className="p-2">What it means</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_MAPPING_HELP.map((h) => (
                <tr key={h.field} className="border-t align-top">
                  <td className="p-2 font-medium">{h.label}</td>
                  <td className="p-2 capitalize">{h.reliability}</td>
                  <td className="p-2">{h.feedsScoring ? "Yes" : "No"}</td>
                  <td className="p-2 text-muted-foreground">{h.helpText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </ManagerLayout>
  );
}

function FieldsSection({
  title,
  fields,
  tone,
  footnote,
}: {
  title: string;
  fields: OnboardingField[];
  tone: "required" | "optional" | "contextual";
  footnote?: string;
}) {
  const toneClass =
    tone === "required"
      ? "border-rose-200 bg-rose-50/40"
      : tone === "optional"
        ? "border-sky-200 bg-sky-50/40"
        : "border-slate-200 bg-slate-50/40";
  return (
    <section className={`border rounded-lg p-5 ${toneClass}`}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="mt-3 grid sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <li key={f.key} className="text-sm">
            <p className="font-medium">{f.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{f.explanation}</p>
            <p className="text-[11px] mt-1">
              <span className="capitalize">{f.reliability}</span> ·{" "}
              {f.feedsScoring ? "feeds scoring" : "explanation only"}
            </p>
          </li>
        ))}
      </ul>
      {footnote && <p className="text-xs text-muted-foreground mt-3">{footnote}</p>}
    </section>
  );
}

function Bucket({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  const colour =
    tone === "emerald" ? "text-emerald-800"
    : tone === "sky" ? "text-sky-800"
    : tone === "amber" ? "text-amber-800"
    : tone === "rose" ? "text-rose-800"
    : "text-slate-800";
  return (
    <div className="mt-2">
      <p className={`text-xs font-semibold ${colour}`}>{label}</p>
      <ul className="list-disc pl-5 text-xs text-muted-foreground">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
