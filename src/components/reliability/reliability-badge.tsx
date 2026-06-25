/**
 * Phase 17B — manager-facing reliability badges.
 *
 * Renders a compact "Measured / Derived / Estimated / Contextual / Blocked"
 * chip based on the central Data Source Reliability Framework registry.
 *
 * Do NOT import these into /server/* routes — reliability/audit detail is
 * manager intelligence and must not leak to the gamified server side.
 */
import * as React from "react";
import {
  classifyFieldReliability,
  type ReliabilityClass,
  type FieldLike,
  requiresWarning,
  type ReliabilityEntry,
} from "@/lib/data-reliability";
import { AlertTriangle, ShieldCheck, Sigma, FlaskConical, MessageSquare, Ban } from "lucide-react";

const CLASS_LABEL: Record<ReliabilityClass, string> = {
  measured: "Measured",
  derived: "Derived",
  estimated: "Estimated",
  contextual: "Context only",
  untrusted: "Blocked",
};

const CLASS_TONE: Record<ReliabilityClass, string> = {
  measured: "bg-brand-green/10 text-brand-green border-brand-green/30",
  derived: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  estimated: "bg-brand-orange/10 text-brand-orange border-brand-orange/30",
  contextual: "bg-muted text-muted-foreground border-border",
  untrusted: "bg-rose-100 text-rose-700 border-rose-300",
};

const CLASS_ICON: Record<ReliabilityClass, React.ComponentType<{ className?: string }>> = {
  measured: ShieldCheck,
  derived: Sigma,
  estimated: FlaskConical,
  contextual: MessageSquare,
  untrusted: Ban,
};

const PLAIN_TOOLTIP: Record<ReliabilityClass, string> = {
  measured: "Measured directly from POS or labour data.",
  derived: "Derived from measured POS and labour data.",
  estimated: "Estimated — review before relying on this.",
  contextual: "Context only — not used for scoring unless verified.",
  untrusted: "Blocked — insufficient reliable data for scoring.",
};

export interface ReliabilityBadgeProps {
  /** Registry key (FIELD_REGISTRY) or a fully-formed ReliabilityEntry. */
  field: FieldLike;
  className?: string;
  /** Optional override label, e.g. "Sales basis: Measured from POS". */
  prefix?: string;
}

export function ReliabilityBadge({ field, className, prefix }: ReliabilityBadgeProps) {
  const entry: ReliabilityEntry =
    typeof field === "string" ? classifyFieldReliability(field) : field;
  const Icon = CLASS_ICON[entry.reliability];
  const warn = requiresWarning(entry);
  const tooltip =
    (entry.notes ? `${entry.notes} ` : "") + PLAIN_TOOLTIP[entry.reliability];

  return (
    <span
      data-testid="reliability-badge"
      data-field={entry.field}
      data-reliability={entry.reliability}
      title={tooltip}
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CLASS_TONE[entry.reliability]} ${className ?? ""}`}
    >
      <Icon className="h-3 w-3" />
      {prefix ? <span className="opacity-70 normal-case font-medium">{prefix}</span> : null}
      <span>{CLASS_LABEL[entry.reliability]}</span>
      {warn ? <AlertTriangle className="h-3 w-3" data-testid="reliability-warning-icon" /> : null}
    </span>
  );
}
