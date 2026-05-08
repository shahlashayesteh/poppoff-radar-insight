import { supabase } from "@/integrations/supabase/client";

export async function claimServerCsvData() {
  await (supabase.rpc as any)("claim_placeholder_data").then(() => {}, () => {});
}