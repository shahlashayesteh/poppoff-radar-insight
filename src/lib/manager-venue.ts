import { supabase } from "@/integrations/supabase/client";

export type ManagerVenue = { id: string; name: string; join_code: string };

export async function getManagerVenue() {
  const { data, error } = await supabase.rpc("get_my_manager_venue" as never);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as ManagerVenue[];
  return rows[0] ?? null;
}
