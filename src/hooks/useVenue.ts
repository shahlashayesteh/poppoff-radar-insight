import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Venue = { id: string; name: string; join_code: string; manager_id: string };

export function useVenue(userId: string | null, role: "manager" | "server" | null) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId || !role) { setVenue(null); setLoading(false); return; }
    setLoading(true);
    if (role === "manager") {
      const { data } = await supabase
        .from("venues").select("id, name, join_code, manager_id")
        .eq("manager_id", userId).order("created_at").limit(1).maybeSingle();
      setVenue(data ?? null);
    } else {
      const { data: vm } = await supabase
        .from("venue_members").select("venue_id").eq("user_id", userId).order("joined_at").limit(1).maybeSingle();
      if (vm?.venue_id) {
        const { data } = await supabase
          .from("venues").select("id, name, join_code, manager_id")
          .eq("id", vm.venue_id).maybeSingle();
        setVenue(data ?? null);
      } else {
        setVenue(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [userId, role]);

  return { venue, loading, refresh: load };
}
