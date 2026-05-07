import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerLayout } from "@/components/server-layout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/server/")({
  component: ServerDashboard,
});

type Loaded = { fullName: string | null; venueName: string | null };

function ServerDashboard() {
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { if (!cancelled) setData({ fullName: null, venueName: null }); return; }

      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
        supabase
          .from("venue_members")
          .select("venue:venues(name)")
          .eq("user_id", uid)
          .limit(1)
          .maybeSingle(),
      ]);

      const venueName =
        (membership?.venue as { name: string } | { name: string }[] | null) == null
          ? null
          : Array.isArray(membership!.venue)
            ? (membership!.venue[0]?.name ?? null)
            : (membership!.venue as { name: string }).name;

      if (!cancelled) setData({ fullName: profile?.full_name ?? null, venueName });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ServerLayout>
      <div className="px-5 pt-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xl">👋</span>
          <span className="font-medium">
            {data === null ? "Loading…" : `Hey ${data.fullName ?? "there"}!`}
          </span>
        </div>

        <h1 className="mt-4 font-display text-[44px] leading-[1] font-extrabold tracking-tight">
          Welcome to<br />
          <span style={{ color: "var(--brand-green)" }}>{data?.venueName ?? "your venue"}</span>
        </h1>

        <div className="mt-8 rounded-3xl bg-white border border-border p-8 text-center">
          <div className="font-display font-bold">No data yet.</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Data will appear here once your team starts logging shifts.
          </p>
        </div>
      </div>
    </ServerLayout>
  );
}
