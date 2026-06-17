// Duplicate preservation + classification (raw rows always preserved).
import { createHash } from "crypto";

export function rawRowHash(row: unknown): string {
  return createHash("md5").update(JSON.stringify(row)).digest("hex");
}

export interface DuplicateClassification {
  hash: string;
  duplicate_status: "unique" | "duplicate_candidate";
  reconciliation_status: "pending" | "duplicate_pending";
  excluded_from_canonical: boolean;
}

/** Classify a new row against already-seen hashes in the same venue/batch context. */
export function classifyDuplicate(hash: string, seen: Set<string>): DuplicateClassification {
  if (seen.has(hash))
    return { hash, duplicate_status: "duplicate_candidate", reconciliation_status: "duplicate_pending", excluded_from_canonical: true };
  seen.add(hash);
  return { hash, duplicate_status: "unique", reconciliation_status: "pending", excluded_from_canonical: false };
}
