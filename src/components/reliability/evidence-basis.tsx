/**
 * Phase 17B — Recommendation evidence basis renderer.
 *
 * Surfaces "Based on" measured/derived inputs and "Not used / low confidence"
 * contextual or untrusted inputs next to AI-driven recommendations
 * (coaching priorities, menu suggestions, weekly wins).
 *
 * Wraps buildRecommendationEvidence so every recommendation makes its basis
 * legible to the manager.
 */
import * as React from "react";
import {
  buildRecommendationEvidence,
  type FieldLike,
  type RecommendationEvidence,
} from "@/lib/data-reliability";
import { AlertTriangle, CheckCircle2, EyeOff } from "lucide-react";

const CONFIDENCE_LABEL: Record<RecommendationEvidence["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  blocked: "Blocked — insufficient data",
};

const CONFIDENCE_TONE: Record<RecommendationEvidence["confidence"], string> = {
  high: "text-brand-green",
  medium: "text-brand-orange",
  low: "text-muted-foreground",
  blocked: "text-rose-700",
};

export interface EvidenceBasisProps {
  fields: FieldLike[];
  className?: string;
  /** When true, only renders the confidence chip (compact list-item view). */
  compact?: boolean;
}

export function EvidenceBasis({ fields, className, compact }: EvidenceBasisProps) {
  const evidence = React.useMemo(() => buildRecommendationEvidence(fields), [fields]);
  const used = evidence.fields.filter(
    (f) => f.reliability === "measured" || f.reliability === "derived",
  );
  const warn = evidence.fields.filter((f) => f.reliability === "estimated");
  const notUsed = evidence.fields.filter(
    (f) => f.reliability === "contextual" || f.reliability === "untrusted",
  );

  if (compact) {
    return (
      <span
        data-testid="evidence-basis-compact"
        data-confidence={evidence.confidence}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_TONE[evidence.confidence]} ${className ?? ""}`}
        title={CONFIDENCE_LABEL[evidence.confidence]}
      >
        {evidence.isBlocked ? (
          <EyeOff className="h-3 w-3" />
        ) : evidence.hasWarning ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        {CONFIDENCE_LABEL[evidence.confidence]}
      </span>
    );
  }

  return (
    <div
      data-testid="evidence-basis"
      data-confidence={evidence.confidence}
      data-blocked={evidence.isBlocked}
      className={`rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] ${className ?? ""}`}
    >
      <div className={`font-semibold ${CONFIDENCE_TONE[evidence.confidence]}`}>
        {CONFIDENCE_LABEL[evidence.confidence]}
      </div>
      {used.length > 0 && (
        <div className="mt-0.5 text-muted-foreground">
          <span className="font-medium text-foreground">Based on:</span>{" "}
          {used.map((f) => f.label).join(", ")}
        </div>
      )}
      {warn.length > 0 && (
        <div className="mt-0.5 text-brand-orange">
          <AlertTriangle className="h-2.5 w-2.5 inline -mt-0.5 mr-1" />
          <span className="font-medium">Estimated input — review:</span>{" "}
          {warn.map((f) => f.label).join(", ")}
        </div>
      )}
      {notUsed.length > 0 && (
        <div className="mt-0.5 text-muted-foreground">
          <EyeOff className="h-2.5 w-2.5 inline -mt-0.5 mr-1" />
          <span className="font-medium">Not used for scoring:</span>{" "}
          {notUsed.map((f) => f.label).join(", ")}
        </div>
      )}
    </div>
  );
}
