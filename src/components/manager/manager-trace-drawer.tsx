// Phase 21 — Manager Trace Drawer.
//
// Lightweight Sheet-based "View evidence / Trace source" panel surfaced
// across paid manager pages. Renders provenance, recommendation evidence
// and OF v2 assessment metadata in plain operator language. Never used on
// /server/* routes — trace data is manager-only intelligence.
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, AlertTriangle, ShieldCheck, Info, EyeOff } from "lucide-react";

type ProvenanceLike = {
  source_system: string | null;
  source_file: string | null;
  source_batch_id: string | null;
  source_row_hash: string | null;
  sales_basis: string | null;
  labor_basis: string | null;
  reliability_class: string | null;
  calculation_safety: string | null;
  identity_match_method: string | null;
  identity_match_confidence: number | null;
  warnings: string[];
  imported_at: string | null;
  committed_at: string | null;
};

type EvidenceLike = {
  based_on: string[];
  estimated_inputs: string[];
  excluded_contextual_fields: string[];
  blocked_fields: string[];
  explanation_basis: string | null;
  recommendation_confidence: string | null;
};

type OfBucketLike = {
  bucket_type: string;
  bucket_key: string;
  applied_v1_factor: number | null;
  preview_v2_factor: number | null;
  delta: number | null;
  confidence: string | null;
  basis: string | null;
  hours_source: string | null;
  decision_grade: string | null;
  can_drive_hard_recommendation: boolean;
  comparable_count: number | null;
  inputs_used: string[];
  inputs_excluded: string[];
  warnings: string[];
  fallback_reason: string | null;
  generated_at: string | null;
};

export type TracePayload =
  | { kind: "loading" }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "lls";
      weekStart: string;
      sampleCount: number;
      reliabilityTally: Record<string, number>;
      samples: Array<{ shift_id: string; service_date: string; daypart: string | null } & ProvenanceLike>;
    }
  | {
      kind: "reports";
      sampled: number;
      tally: {
        sales_basis: Record<string, number>;
        labor_basis: Record<string, number>;
        reliability_class: Record<string, number>;
        source_system: Record<string, number>;
      };
    }
  | {
      kind: "import";
      batch: any;
      sampleRows: Array<{ row_index: number; row_hash: string | null; validation_status: string; warnings: any }>;
    }
  | {
      kind: "recommendation";
      recordType: "weekly_priority" | "menu_suggestion";
      evidence: EvidenceLike | null;
      created_at: string | null;
    }
  | {
      kind: "ofv2";
      weekStart: string;
      overall: OfBucketLike | null;
      byDaypart: OfBucketLike[];
      byDayOfWeek: OfBucketLike[];
    };

const PLAIN_BASIS: Record<string, string> = {
  net: "Measured from POS (net of tax/service)",
  gross: "Measured from POS (gross)",
  gross_as_net_estimated: "Estimated, review before relying",
  unknown: "Unknown — review before relying",
  wages_only: "Measured wages only",
  wages_plus_oncosts: "Derived from wages plus on-costs",
  unknown_estimated: "Estimated, review before relying",
};

const PLAIN_RELIABILITY: Record<string, string> = {
  measured: "Measured from POS",
  derived: "Derived from POS plus labour data",
  estimated: "Estimated, review before relying",
  contextual: "Context only, not used for scoring",
  untrusted: "Blocked, insufficient reliable data",
};

const PLAIN_HOURS: Record<string, string> = {
  paid_hours: "Paid hours (measured)",
  clock_hours: "Clock-in/out hours (measured)",
  labour_export_hours: "Labour export hours (measured)",
  labour_cost_proxy: "Labour-cost proxy (estimated — preview only)",
  missing_hours: "Hours missing (not for decision)",
};

export interface ManagerTraceDrawerProps {
  /** Short button label, e.g. "View evidence" or "Trace source". */
  label?: string;
  title: string;
  payload: TracePayload;
  onOpen?: () => void;
  /** Optional inline trigger override. */
  trigger?: React.ReactNode;
}

export function ManagerTraceDrawer({
  label = "View evidence",
  title,
  payload,
  onOpen,
  trigger,
}: ManagerTraceDrawerProps) {
  return (
    <Sheet
      onOpenChange={(open) => {
        if (open && onOpen) onOpen();
      }}
    >
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5"
            data-testid="manager-trace-trigger"
          >
            <Search className="h-3 w-3" />
            {label}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-hidden"
        data-testid="manager-trace-drawer"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)] pr-3 mt-3">
          <TraceBody payload={payload} />
          <div className="mt-6 rounded-md border border-dashed border-border bg-muted/30 p-2 text-[10px] text-muted-foreground">
            Section data, weather and free-text notes are context only and are
            not used for scoring unless verified.
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function TraceBody({ payload }: { payload: TracePayload }) {
  if (payload.kind === "loading") {
    return <p className="text-xs text-muted-foreground">Loading evidence…</p>;
  }
  if (payload.kind === "empty") {
    return <p className="text-xs text-muted-foreground">{payload.message}</p>;
  }
  if (payload.kind === "error") {
    return (
      <p className="text-xs text-rose-700">
        <AlertTriangle className="inline h-3 w-3 mr-1" /> {payload.message}
      </p>
    );
  }
  if (payload.kind === "lls") return <LlsTrace payload={payload} />;
  if (payload.kind === "reports") return <ReportsTrace payload={payload} />;
  if (payload.kind === "import") return <ImportTrace payload={payload} />;
  if (payload.kind === "recommendation") return <RecTrace payload={payload} />;
  if (payload.kind === "ofv2") return <OfV2Trace payload={payload} />;
  return null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/40 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right break-all">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3" data-testid={`trace-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
        {title}
      </h3>
      <div className="rounded-md border border-border bg-card px-3 py-2">{children}</div>
    </section>
  );
}

function plainOrRaw(map: Record<string, string>, key: string | null): string | null {
  if (!key) return null;
  return map[key] ?? key;
}

function ProvenanceCard({ p }: { p: ProvenanceLike }) {
  return (
    <Section title="Source">
      <Field label="Source system" value={p.source_system} />
      <Field label="Source filename" value={p.source_file} />
      <Field label="Import batch" value={p.source_batch_id} />
      <Field label="Source row hash" value={p.source_row_hash} />
      <Field label="Imported at" value={p.imported_at} />
      <Field label="Committed at" value={p.committed_at} />
      <Field label="Sales basis" value={plainOrRaw(PLAIN_BASIS, p.sales_basis)} />
      <Field label="Labour basis" value={plainOrRaw(PLAIN_BASIS, p.labor_basis)} />
      <Field
        label="Reliability"
        value={plainOrRaw(PLAIN_RELIABILITY, p.reliability_class)}
      />
      <Field label="Calculation safety" value={p.calculation_safety} />
      <Field label="Identity match method" value={p.identity_match_method} />
      <Field
        label="Identity match confidence"
        value={
          p.identity_match_confidence != null
            ? p.identity_match_confidence.toFixed(2)
            : null
        }
      />
      {p.warnings.length > 0 ? (
        <div className="pt-1.5 text-[11px] text-brand-orange">
          <AlertTriangle className="inline h-3 w-3 mr-1" /> {p.warnings.join("; ")}
        </div>
      ) : null}
    </Section>
  );
}

function LlsTrace({
  payload,
}: {
  payload: Extract<TracePayload, { kind: "lls" }>;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Sample of {payload.sampleCount} committed shifts for the week of{" "}
        {payload.weekStart}. Reliability mix:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        {Object.entries(payload.reliabilityTally).map(([k, v]) => (
          <span
            key={k}
            className="rounded-md border border-border bg-muted px-1.5 py-0.5"
            data-testid={`trace-reliability-tally-${k}`}
          >
            {plainOrRaw(PLAIN_RELIABILITY, k)}: {v}
          </span>
        ))}
      </div>
      {payload.samples.slice(0, 3).map((s) => (
        <div key={s.shift_id} className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Shift {s.service_date} · {s.daypart ?? "—"}
          </div>
          <ProvenanceCard p={s} />
        </div>
      ))}
      {payload.samples.length > 3 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          + {payload.samples.length - 3} more shifts share the same provenance shape.
        </p>
      ) : null}
    </div>
  );
}

function ReportsTrace({
  payload,
}: {
  payload: Extract<TracePayload, { kind: "reports" }>;
}) {
  const renderTally = (label: string, t: Record<string, number>, map?: Record<string, string>) => (
    <Section title={label}>
      {Object.entries(t).map(([k, v]) => (
        <Field key={k} label={map?.[k] ?? k} value={v} />
      ))}
    </Section>
  );
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Across the {payload.sampled} most recent committed shifts.
      </p>
      {renderTally("Sales basis", payload.tally.sales_basis, PLAIN_BASIS)}
      {renderTally("Labour basis", payload.tally.labor_basis, PLAIN_BASIS)}
      {renderTally("Reliability", payload.tally.reliability_class, PLAIN_RELIABILITY)}
      {renderTally("Source system", payload.tally.source_system)}
    </div>
  );
}

function ImportTrace({
  payload,
}: {
  payload: Extract<TracePayload, { kind: "import" }>;
}) {
  const b = payload.batch ?? {};
  return (
    <div>
      <Section title="Batch">
        <Field label="Source system" value={b.source_system} />
        <Field label="Source filename" value={b.source_filename} />
        <Field label="Import type" value={b.import_type ?? b.source_kind} />
        <Field label="File hash" value={b.file_hash} />
        <Field label="Status" value={b.status} />
        <Field label="Rows" value={b.row_count} />
        <Field label="Accepted" value={b.accepted_count} />
        <Field label="Rejected" value={b.rejected_count} />
        <Field label="Warnings" value={b.warning_count} />
        <Field label="Approved at" value={b.approved_at} />
        <Field label="Committed at" value={b.committed_at} />
      </Section>
      {payload.sampleRows.length > 0 ? (
        <Section title="Sample rows">
          <div className="space-y-1">
            {payload.sampleRows.slice(0, 8).map((r) => (
              <div key={r.row_index} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">#{r.row_index}</span>
                <span className="font-mono truncate max-w-[55%]">{r.row_hash ?? "—"}</span>
                <span
                  className={
                    r.validation_status === "valid"
                      ? "text-brand-green"
                      : "text-brand-orange"
                  }
                >
                  {r.validation_status}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function RecTrace({
  payload,
}: {
  payload: Extract<TracePayload, { kind: "recommendation" }>;
}) {
  if (!payload.evidence) {
    return (
      <p className="text-xs text-muted-foreground">
        No evidence recorded for this recommendation yet.
      </p>
    );
  }
  const e = payload.evidence;
  return (
    <div>
      <Section title="Recommendation">
        <Field
          label="Confidence"
          value={e.recommendation_confidence ?? "—"}
        />
        <Field label="Explanation basis" value={e.explanation_basis} />
        <Field label="Generated" value={payload.created_at} />
      </Section>
      <Section title="Based on">
        {e.based_on.length === 0 ? (
          <p className="text-[11px] text-rose-700">
            <EyeOff className="inline h-3 w-3 mr-1" /> Blocked — no measured or
            derived inputs available.
          </p>
        ) : (
          <ul className="text-[11px] text-foreground list-disc pl-4">
            {e.based_on.map((b) => (
              <li key={b}>
                <ShieldCheck className="inline h-3 w-3 mr-1 text-brand-green" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {e.estimated_inputs.length > 0 ? (
        <Section title="Estimated inputs — review">
          <ul className="text-[11px] text-brand-orange list-disc pl-4">
            {e.estimated_inputs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {e.excluded_contextual_fields.length > 0 ? (
        <Section title="Excluded contextual fields">
          <ul className="text-[11px] text-muted-foreground list-disc pl-4">
            {e.excluded_contextual_fields.map((x) => (
              <li key={x}>
                <Info className="inline h-3 w-3 mr-1" /> {x} — context only, not
                used for scoring
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {e.blocked_fields.length > 0 ? (
        <Section title="Blocked fields">
          <ul className="text-[11px] text-rose-700 list-disc pl-4">
            {e.blocked_fields.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function OfV2Trace({
  payload,
}: {
  payload: Extract<TracePayload, { kind: "ofv2" }>;
}) {
  const overall = payload.overall;
  return (
    <div>
      <div
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
        data-testid="ofv2-preview-only-banner"
      >
        <Info className="inline h-3 w-3 mr-1" />
        OF v2 preview only. Applied LLS still uses v1.
      </div>
      {overall ? (
        <Section title="Overall">
          <Field
            label="Applied v1 factor"
            value={overall.applied_v1_factor?.toFixed(3)}
          />
          <Field
            label="Preview v2 factor"
            value={overall.preview_v2_factor?.toFixed(3)}
          />
          <Field
            label="Delta"
            value={overall.delta != null ? overall.delta.toFixed(3) : null}
          />
          <Field label="Confidence" value={overall.confidence} />
          <Field label="Basis" value={overall.basis} />
          <Field
            label="Hours source"
            value={plainOrRaw(PLAIN_HOURS, overall.hours_source)}
          />
          <Field label="Decision grade" value={overall.decision_grade} />
          <Field
            label="Can drive recommendation"
            value={overall.can_drive_hard_recommendation ? "yes" : "no — preview only"}
          />
          <Field label="Comparable shifts" value={overall.comparable_count} />
          <Field label="Fallback reason" value={overall.fallback_reason} />
          <Field label="Generated at" value={overall.generated_at} />
          {overall.inputs_used.length > 0 ? (
            <div className="pt-1 text-[11px] text-foreground">
              <span className="font-medium">Inputs used:</span>{" "}
              {overall.inputs_used.join(", ")}
            </div>
          ) : null}
          {overall.inputs_excluded.length > 0 ? (
            <div className="pt-1 text-[11px] text-muted-foreground">
              <span className="font-medium">Inputs excluded:</span>{" "}
              {overall.inputs_excluded.join(", ")} — not used for scoring
            </div>
          ) : null}
          {overall.warnings.length > 0 ? (
            <div className="pt-1 text-[11px] text-brand-orange">
              <AlertTriangle className="inline h-3 w-3 mr-1" />{" "}
              {overall.warnings.join("; ")}
            </div>
          ) : null}
        </Section>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No OF v2 assessment recorded yet for {payload.weekStart}.
        </p>
      )}
      {payload.byDaypart.length > 0 ? (
        <Section title="By daypart">
          {payload.byDaypart.map((b) => (
            <BucketLine key={`dp-${b.bucket_key}`} b={b} />
          ))}
        </Section>
      ) : null}
      {payload.byDayOfWeek.length > 0 ? (
        <Section title="By day of week">
          {payload.byDayOfWeek.map((b) => (
            <BucketLine key={`dow-${b.bucket_key}`} b={b} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function BucketLine({ b }: { b: OfBucketLike }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-1 border-b border-border/40">
      <span className="font-medium capitalize">{b.bucket_key}</span>
      <span className="text-muted-foreground">
        v1 {b.applied_v1_factor?.toFixed(2) ?? "—"} → v2{" "}
        {b.preview_v2_factor?.toFixed(2) ?? "—"}{" "}
        <span
          className={
            b.can_drive_hard_recommendation
              ? "text-brand-green"
              : "text-muted-foreground"
          }
        >
          ({b.decision_grade ?? "—"})
        </span>
      </span>
    </div>
  );
}
