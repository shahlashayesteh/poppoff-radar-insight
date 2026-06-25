// Phase 26 — /manager/adoption page.
//
// Lightweight customer success and adoption layer. Helps managers actually
// use PoppOff during a pilot. Strictly manager-only.
//
// Guarded by:
//   - <PaidManagerGate /> (UI + server verification via useVerifyPaidManagerAccess)
//   - useActiveVenue + <NoVenueState /> (no venue means no read)
//   - getAdoptionStatus enforces requirePaidManagerEntitlement + assertVenueAccess
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { useVerifyPaidManagerAccess } from "@/hooks/use-verify-paid-manager-access";
import { getAdoptionStatus } from "@/lib/adoption.functions";
import {
  ADOPTION_CHECKLIST,
  WEEKLY_REVIEW_RHYTHM,
  CUSTOMER_SUCCESS_PRINCIPLES,
  PILOT_NOTES_PROMPTS,
  LEADERSHIP_HANDOFF_LINKS,
  buildAdoptionIndicators,
  type AdoptionSignals,
} from "@/lib/adoption/customer-success";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HeartHandshake,
  CalendarClock,
  ClipboardList,
  ClipboardCopy,
  Compass,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/manager/adoption")({
  component: () => (
    <PaidManagerGate feature="reports">
      <Page />
    </PaidManagerGate>
  ),
});

function Page() {
  const active = useActiveVenue();
  useVerifyPaidManagerAccess();
  const fetchStatus = useServerFn(getAdoptionStatus);
  const [signals, setSignals] = useState<AdoptionSignals | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const venueId = active.venueId;
  useEffect(() => {
    if (active.status !== "ready" || !venueId) return;
    let cancelled = false;
    setLoadError(null);
    fetchStatus({ data: { venueId } })
      .then((r) => { if (!cancelled) setSignals(r.signals); })
      .catch((e: any) => { if (!cancelled) setLoadError(e?.message ?? "Could not load adoption status"); });
    return () => { cancelled = true; };
  }, [active.status, venueId, fetchStatus]);

  if (active.status !== "ready") {
    return <ManagerLayout><div className="p-6"><NoVenueState status={active.status} venues={active.venues} /></div></ManagerLayout>;
  }

  const indicators = buildAdoptionIndicators(signals);

  const copyPrompts = () => {
    const text = PILOT_NOTES_PROMPTS.map((p, i) => `${i + 1}. ${p}\n   `).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <ManagerLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <HeartHandshake className="h-6 w-6 mt-1 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold">Customer Success & Adoption</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              A simple weekly rhythm and checklist to help your team actually use PoppOff during the pilot.
              Coaching, not punishment.
            </p>
          </div>
        </header>

        {/* Coaching-first principles */}
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Compass className="h-4 w-4" /> How to roll this out
          </h2>
          <ul className="grid md:grid-cols-2 gap-2 text-sm">
            {CUSTOMER_SUCCESS_PRINCIPLES.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Pilot adoption checklist */}
        <section className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Pilot adoption checklist</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {ADOPTION_CHECKLIST.map((group) => (
              <div key={group.title}>
                <div className="text-sm font-medium mb-2">{group.title}</div>
                <ul className="space-y-2 text-sm">
                  {group.items.map((it) => (
                    <li key={it.id} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <Link to={it.href} className="font-medium hover:underline">{it.label}</Link>
                        <div className="text-xs text-muted-foreground">{it.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Adoption indicators */}
        <section className="rounded-xl border border-border bg-white p-5">
          <h2 className="text-lg font-semibold mb-3">Adoption status</h2>
          {loadError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-3">
              Could not load live adoption signals — showing safe defaults. {loadError}
            </div>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {indicators.map((ind) => (
              <div key={ind.id} className="rounded-md border border-border p-3 flex items-start gap-2">
                {ind.status === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />}
                {ind.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
                {ind.status === "missing" && <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />}
                <div>
                  <div className="font-medium">{ind.label}</div>
                  <div className="text-xs text-muted-foreground">{ind.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Indicators are intentionally lightweight. They show what's available, not who to blame.
          </p>
        </section>

        {/* Weekly review rhythm */}
        <section className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Weekly review rhythm</h2>
          </div>
          <ol className="space-y-2 text-sm">
            {WEEKLY_REVIEW_RHYTHM.map((step) => (
              <li key={step.day} className="flex items-start gap-3 rounded-md border border-border p-3">
                <span className="inline-flex h-7 min-w-[5.5rem] items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-2">
                  {step.day}
                </span>
                <div>
                  <div className="font-medium">{step.focus}</div>
                  <div className="text-xs text-muted-foreground">{step.action}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Pilot notes prompts */}
        <section className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold">Pilot notes</h2>
            <button
              onClick={copyPrompts}
              className="ml-auto inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ClipboardCopy className="h-4 w-4" /> Copy prompts
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Copy these prompts into your weekly review doc — keep notes outside the product so leadership can audit them.
          </p>
          <ol className="grid md:grid-cols-2 gap-2 text-sm list-decimal pl-5">
            {PILOT_NOTES_PROMPTS.map((p) => <li key={p}>{p}</li>)}
          </ol>
        </section>

        {/* Leadership handoff */}
        <section className="rounded-xl border border-border bg-white p-5">
          <h2 className="text-lg font-semibold mb-3">Leadership handoff</h2>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            {LEADERSHIP_HANDOFF_LINKS.map((l) => (
              <Link key={l.label + l.href} to={l.href} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-muted">
                <ArrowRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <div className="font-medium">{l.label}</div>
                  <div className="text-xs text-muted-foreground">{l.blurb}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </ManagerLayout>
  );
}
