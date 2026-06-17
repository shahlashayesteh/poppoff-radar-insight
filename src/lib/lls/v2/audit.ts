// Audit event recording helper — used by server functions to log lifecycle events.
export interface AuditEvent {
  venue_id: string;
  event_type:
    | "reconciliation_run"
    | "batch_superseded"
    | "identity_decision"
    | "duplicate_decision"
    | "single_sided_authorised"
    | "of_override_set"
    | "calculation_recomputed";
  payload: Record<string, unknown>;
}
