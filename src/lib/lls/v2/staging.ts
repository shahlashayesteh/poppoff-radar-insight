// Staging row builder utilities — used by import.functions.ts to construct ingest payloads.
import { rawRowHash } from "./duplicates";

export type SourceKind = "sales" | "labor";

export interface StagingRowInput {
  source_kind: SourceKind;
  service_date: string;
  reported_identity_id?: string | null;
  reported_identity_name?: string | null;
  raw: Record<string, unknown>;
  sales?: {
    first_txn_time?: string;
    last_txn_time?: string;
    check_open_time?: string;
    check_close_time?: string;
    report_period_start?: string;
    report_period_end?: string;
    employee_shift_start?: string;
    employee_shift_end?: string;
    gross?: number;
    net?: number;
    covers?: number;
  };
  labor?: {
    scheduled_start?: string;
    scheduled_end?: string;
    clock_in?: string;
    clock_out?: string;
    cost?: number;
    hours?: number;
    role?: string;
  };
}

export function buildIngestPayload(opts: {
  source_kind: SourceKind | "combined";
  source_filename?: string;
  rows: StagingRowInput[];
}) {
  return {
    source_kind: opts.source_kind,
    source_filename: opts.source_filename,
    rows: opts.rows.map((r) => ({
      ...r,
      raw_row_hash: rawRowHash(r.raw),
    })),
  };
}
