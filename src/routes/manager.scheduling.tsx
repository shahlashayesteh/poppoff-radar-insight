// Shift Match Planner — manager-only suggested deployment plan.
//
// Manager keeps control. Draft only. Copy or export before leaving.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { useVerifyPaidManagerAccess } from "@/hooks/use-verify-paid-manager-access";
import { getShiftMatchPlan } from "@/lib/scheduling.functions";
import type { AssignmentEntry, ShiftMatchPlan } from "@/lib/scheduling/shift-match-planner";
import { Calendar, AlertTriangle, Copy, RefreshCw, CheckCircle2, XCircle, Repeat, StickyNote, Info } from "lucide-react";

export const Route = createFileRoute("/manager/scheduling")({
  component: () => (
    <PaidManagerGate feature="Shift Match Planner">
      <Page />
    </PaidManagerGate>
  ),
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Decision = "accept" | "reject" | "swap" | null;
type ManagerDraft = {
  decisions: Record<string, Decision>;
  notes: Record<string, string>;
  swapTo: Record<string, string>; // slotId -> backup serverId
};

function slotKey(a: AssignmentEntry): string {
  return `${a.day}__${a.daypart}__${a.slotNumber}`;
}

function Page() {
  const active = useActiveVenue();
  useVerifyPaidManagerAccess();
  const fetchPlan = useServerFn(getShiftMatchPlan);

  const [data, setData] = useState<Awaited<ReturnType<typeof getShiftMatchPlan>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManagerDraft>({ decisions: {}, notes: {}, swapTo: {} });

  const venueId = active.venueId;

  useEffect(() => {
    if (active.status !== "ready" || !venueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPlan({ data: { venueId } })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load Shift Match Planner"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active.status, venueId, fetchPlan]);

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
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold flex items-center gap-2">
              <Calendar className="h-7 w-7 text-brand-green" />
              Shift Match Planner
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              A manager-adjustable <strong>suggested deployment plan</strong> based on
              historical performance, shift patterns and data confidence. Draft only —
              review before using. This is not a final rota.
            </p>
          </div>
          {data && (
            <button
              onClick={() => copySummary(data.plan, data.venueName)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
            >
              <Copy className="h-4 w-4" /> Copy plan summary
            </button>
          )}
        </header>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <strong>Draft only.</strong> Copy or export before leaving. Manager adjustments are not persisted.
            This plan does not check availability, holiday, contract, working-time compliance or HR rules.
          </div>
        </div>

        {loading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Building suggested plan…
          </div>
        )}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {data && (
          <PlannerView
            data={data}
            draft={draft}
            setDraft={setDraft}
          />
        )}
      </div>
    </ManagerLayout>
  );
}

function PlannerView({
  data, draft, setDraft,
}: {
  data: { plan: ShiftMatchPlan; venueName: string; weeklyPriorityCategory: string | null; weeksObserved: number };
  draft: ManagerDraft;
  setDraft: (d: ManagerDraft) => void;
}) {
  const { plan } = data;

  if (!plan.dataReadiness.sufficient) {
    return (
      <section className="rounded-xl border border-border bg-white p-6 text-sm">
        <h2 className="text-lg font-semibold mb-2">Not enough trusted history yet</h2>
        <p className="text-muted-foreground">
          Not enough trusted shift history to generate a suggested deployment plan yet.
          Upload at least 4 to 6 weeks of POS and labour data to unlock Shift Match Planner.
        </p>
        <ul className="mt-3 text-xs text-muted-foreground space-y-1">
          <li>Total shifts seen: <strong>{plan.dataReadiness.totalShifts}</strong></li>
          <li>Distinct weeks: <strong>{plan.dataReadiness.distinctWeeks}</strong></li>
          <li>Distinct servers: <strong>{plan.dataReadiness.distinctServers}</strong></li>
        </ul>
      </section>
    );
  }

  // Group assignments by day for the table.
  const byDay = useMemo(() => {
    const m = new Map<number, AssignmentEntry[]>();
    for (const a of plan.assignments) {
      if (!m.has(a.day)) m.set(a.day, []);
      m.get(a.day)!.push(a);
    }
    return m;
  }, [plan.assignments]);

  return (
    <>
      {/* Data readiness */}
      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" /> Data readiness
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Tile label="Shifts analysed" value={String(plan.dataReadiness.totalShifts)} />
          <Tile label="Weeks observed" value={String(plan.dataReadiness.distinctWeeks)} />
          <Tile label="Distinct servers" value={String(plan.dataReadiness.distinctServers)} />
          <Tile label="Slots suggested" value={String(plan.assignments.length)} tone={plan.unfilledSlots > 0 ? "amber" : undefined} />
        </div>
        {plan.warnings.length > 0 && (
          <ul className="mt-3 text-xs text-amber-800 list-disc pl-5 space-y-1">
            {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </section>

      {/* Staffing recommendation */}
      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">Recommended staffing level</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2">Day</th>
                <th className="text-left">Daypart</th>
                <th className="text-right">Baseline</th>
                <th className="text-right">Suggested</th>
                <th className="text-right">Marginal labour return</th>
                <th className="text-left pl-3">Confidence</th>
                <th className="text-left">Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.staffing.map((s, i) => (
                <tr key={i}>
                  <td className="py-2">{DAY_NAMES[s.day]}</td>
                  <td>{s.daypart}</td>
                  <td className="text-right">{s.baseline}</td>
                  <td className={`text-right font-medium ${s.recommended > s.baseline ? "text-emerald-700" : ""}`}>{s.recommended}</td>
                  <td className="text-right">{s.marginalLabourReturn == null ? "—" : s.marginalLabourReturn.toFixed(1)}</td>
                  <td className="pl-3"><ConfBadge level={s.confidence} /></td>
                  <td className="text-muted-foreground">{s.rationale}{s.warning ? ` — ${s.warning}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Server quotas */}
      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">Server shift count assumptions</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Inferred from the last several weeks of comparable history. The planner preserves
          these by default so the strongest server does not absorb every best shift.
        </p>
        <div className="flex flex-wrap gap-2">
          {plan.serverQuotas.map((q) => (
            <span key={q.serverId} className="rounded-full bg-muted px-3 py-1 text-xs">
              {q.serverName}: <strong>{q.quota}</strong> shifts/wk
              {q.inferredFrom < 3 ? <span className="text-amber-700"> · low history</span> : null}
            </span>
          ))}
        </div>
      </section>

      {/* Suggested weekly deployment table */}
      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">Suggested weekly deployment</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2">Day</th>
                <th className="text-left">Daypart</th>
                <th className="text-center">Slot</th>
                <th className="text-left">Recommended server</th>
                <th className="text-right">Fit</th>
                <th className="text-left pl-2">Confidence</th>
                <th className="text-left">Backup 1</th>
                <th className="text-left">Backup 2</th>
                <th className="text-left">Reason</th>
                <th className="text-left">Manager decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from(byDay.entries()).map(([day, entries]) =>
                entries.map((a) => {
                  const sid = slotKey(a);
                  const decision = draft.decisions[sid] ?? null;
                  return (
                    <tr key={sid} className={decision === "reject" ? "opacity-60" : ""}>
                      <td className="py-2">{DAY_NAMES[day]}</td>
                      <td>{a.daypart}</td>
                      <td className="text-center text-muted-foreground">{a.slotNumber}</td>
                      <td className="font-medium">{a.recommendedServerName ?? <em className="text-muted-foreground">unfilled</em>}</td>
                      <td className="text-right">{a.fitScore ?? "—"}</td>
                      <td className="pl-2"><ConfBadge level={a.confidenceLevel} /></td>
                      <td>{a.backups[0] ? <BackupCell b={a.backups[0]} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td>{a.backups[1] ? <BackupCell b={a.backups[1]} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="text-muted-foreground text-xs max-w-xs">{a.reasonSummary}</td>
                      <td>
                        <DecisionControls
                          assignment={a}
                          decision={decision}
                          swapTo={draft.swapTo[sid] ?? ""}
                          note={draft.notes[sid] ?? ""}
                          onDecide={(d) => setDraft({ ...draft, decisions: { ...draft.decisions, [sid]: d } })}
                          onSwap={(serverId) => setDraft({ ...draft, swapTo: { ...draft.swapTo, [sid]: serverId } })}
                          onNote={(text) => setDraft({ ...draft, notes: { ...draft.notes, [sid]: text } })}
                        />
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Best-fit-by-daypart summary */}
      <BestFitByDaypart plan={plan} />

      {/* Detailed explanations underneath the table */}
      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-lg font-semibold mb-1">Why these placements were suggested</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Each suggestion explains the reasoning, confidence and the backup options
          ranked below the recommended server. Replacement Lift is normalised to a
          0–100 Replacement Lift Score before it is used in the assignment value.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.assignments.map((a) => (
            <ExplanationCard
              key={slotKey(a)}
              a={a}
              note={draft.notes[slotKey(a)] ?? ""}
              onNote={(text) => setDraft({ ...draft, notes: { ...draft.notes, [slotKey(a)]: text } })}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function ConfBadge({ level }: { level: "high" | "medium" | "low" | "blocked" }) {
  const cls =
    level === "high" ? "bg-emerald-100 text-emerald-800"
    : level === "medium" ? "bg-amber-100 text-amber-800"
    : level === "blocked" ? "bg-rose-100 text-rose-800"
    : "bg-muted text-muted-foreground";
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{level}</span>;
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  const t = tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-muted/40 border-border";
  return (
    <div className={`rounded-md border p-3 ${t}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function BackupCell({ b }: { b: AssignmentEntry["backups"][number] }) {
  return (
    <div className="text-xs">
      <div className="font-medium">{b.serverName}</div>
      <div className="text-muted-foreground">fit {b.fitScore} · <ConfBadge level={b.confidenceLevel} /></div>
    </div>
  );
}

function DecisionControls({
  assignment, decision, swapTo, note, onDecide, onSwap, onNote,
}: {
  assignment: AssignmentEntry;
  decision: Decision;
  swapTo: string;
  note: string;
  onDecide: (d: Decision) => void;
  onSwap: (sid: string) => void;
  onNote: (t: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <button title="Accept" onClick={() => onDecide("accept")} className={`p-1 rounded ${decision === "accept" ? "bg-emerald-100 text-emerald-700" : "hover:bg-muted text-muted-foreground"}`}><CheckCircle2 className="h-3.5 w-3.5" /></button>
        <button title="Reject" onClick={() => onDecide("reject")} className={`p-1 rounded ${decision === "reject" ? "bg-rose-100 text-rose-700" : "hover:bg-muted text-muted-foreground"}`}><XCircle className="h-3.5 w-3.5" /></button>
        <button title="Swap" onClick={() => onDecide("swap")} className={`p-1 rounded ${decision === "swap" ? "bg-amber-100 text-amber-700" : "hover:bg-muted text-muted-foreground"}`}><Repeat className="h-3.5 w-3.5" /></button>
        <button title="Add note" onClick={() => { const n = prompt("Note for this slot:", note); if (n != null) onNote(n); }} className={`p-1 rounded ${note ? "bg-blue-100 text-blue-700" : "hover:bg-muted text-muted-foreground"}`}><StickyNote className="h-3.5 w-3.5" /></button>
      </div>
      {decision === "swap" && assignment.backups.length > 0 && (
        <select
          value={swapTo}
          onChange={(e) => onSwap(e.target.value)}
          className="text-[11px] rounded border border-border px-1 py-0.5 w-full"
        >
          <option value="">Pick backup…</option>
          {assignment.backups.map((b) => (
            <option key={b.serverId} value={b.serverId}>{b.serverName} ({b.fitScore})</option>
          ))}
        </select>
      )}
    </div>
  );
}

function ExplanationCard({ a, note, onNote }: { a: AssignmentEntry; note: string; onNote: (s: string) => void }) {
  return (
    <article className="rounded-lg border border-border p-4 bg-white">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {DAY_NAMES[a.day]} {a.daypart} · Slot {a.slotNumber}
          {a.recommendedServerName ? ` — ${a.recommendedServerName}` : ""}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {a.fitScore != null && <span>Fit {a.fitScore}</span>}
          {a.finalAssignmentValue != null && <span>· Value {a.finalAssignmentValue}</span>}
          <ConfBadge level={a.confidenceLevel} />
        </div>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">{a.detailedReason}</p>
      {(a.replacementLift != null || a.slotImportance != null) && (
        <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {a.replacementLift != null && (
            <span>Replacement lift: <strong>{a.replacementLift >= 0 ? "+" : ""}{a.replacementLift}</strong> (score {a.replacementLiftScore}/100)</span>
          )}
          {a.slotImportance != null && (
            <span>Slot importance: <strong>{a.slotImportance.toFixed(2)}×</strong> (score {a.slotImportanceScore}/100)</span>
          )}
        </div>
      )}
      {a.backups.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Backup options</div>
          {a.backups.map((b, idx) => (
            <div key={b.serverId} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{idx === 0 ? "Backup 1" : "Backup 2"} — {b.serverName}</div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>fit {b.fitScore}</span>
                  <ConfBadge level={b.confidenceLevel} />
                </div>
              </div>
              <div className="mt-1 text-muted-foreground">{b.reason}</div>
              {b.warning && <div className="mt-1 text-amber-800">{b.warning}</div>}
            </div>
          ))}
        </div>
      )}
      {a.warnings.length > 0 && (
        <ul className="mt-3 text-xs text-amber-800 list-disc pl-4 space-y-0.5">
          {a.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      <div className="mt-3">
        <label className="text-xs text-muted-foreground">Manager note (draft)</label>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          className="mt-1 w-full text-xs rounded border border-border px-2 py-1"
          placeholder="Add a note before exporting…"
        />
      </div>
    </article>
  );
}

function BestFitByDaypart({ plan }: { plan: ShiftMatchPlan }) {
  const byDaypart = new Map<string, AssignmentEntry[]>();
  for (const a of plan.assignments) {
    if (!byDaypart.has(a.daypart)) byDaypart.set(a.daypart, []);
    byDaypart.get(a.daypart)!.push(a);
  }
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">Best-fit by daypart</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from(byDaypart.entries()).map(([dp, entries]) => {
          const sorted = [...entries].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)).slice(0, 5);
          return (
            <div key={dp} className="rounded-md border border-border p-3 text-sm">
              <div className="font-semibold mb-2">{dp}</div>
              <ol className="space-y-1 text-xs">
                {sorted.map((a, i) => (
                  <li key={slotKey(a)} className="flex justify-between gap-2">
                    <span>{i + 1}. {DAY_NAMES[a.day]} · {a.recommendedServerName ?? "—"}</span>
                    <span className="text-muted-foreground">{a.fitScore ?? "—"}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function copySummary(plan: ShiftMatchPlan, venueName: string): void {
  const lines: string[] = [];
  lines.push(`Shift Match Planner — ${venueName}`);
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} · Draft only — review before using.`);
  lines.push("");
  lines.push("Suggested weekly deployment:");
  for (const a of plan.assignments) {
    lines.push(`- ${DAY_NAMES[a.day]} ${a.daypart} slot ${a.slotNumber}: ${a.recommendedServerName ?? "unfilled"} (fit ${a.fitScore ?? "—"}, confidence ${a.confidenceLevel})`);
    if (a.backups[0]) lines.push(`    Backup 1: ${a.backups[0].serverName} (fit ${a.backups[0].fitScore}, ${a.backups[0].confidenceLevel})`);
    if (a.backups[1]) lines.push(`    Backup 2: ${a.backups[1].serverName} (fit ${a.backups[1].fitScore}, ${a.backups[1].confidenceLevel})`);
    lines.push(`    Why: ${a.detailedReason}`);
  }
  lines.push("");
  lines.push("Warnings:");
  for (const w of plan.warnings) lines.push(`- ${w}`);
  navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
}
