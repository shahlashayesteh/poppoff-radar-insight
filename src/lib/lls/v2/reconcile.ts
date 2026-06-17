// TS-side reconcile orchestrator — invokes the SQL function which holds the
// advisory lock + atomic transaction. This wrapper is intentionally thin:
// the actual matcher/upserter logic lives in public.lls_v2_run_reconciliation.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReconcileResult {
  promoted: number;
  matched: number;
  unmatched_sales: number;
  unmatched_labor: number;
  ambiguous: number;
  service_periods_refreshed: number;
  batch_id: string;
}

export async function runReconciliation(
  supabase: SupabaseClient,
  venue_id: string,
  batch_id: string,
): Promise<ReconcileResult> {
  const { data, error } = await supabase.rpc("lls_v2_run_reconciliation", {
    _venue_id: venue_id,
    _batch_id: batch_id,
  });
  if (error) throw new Error(error.message);
  return data as ReconcileResult;
}
