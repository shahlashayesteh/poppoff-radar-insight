import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { getMondayOfWeek, toISODate, formatWeekRange } from "@/lib/week";

export const Route = createFileRoute("/manager/reports")({ component: Page });

function Page() {
  const [weeks, setWeeks] = useState<{ week_start: string; covers: number; sales: number; spc: number; servers: number }[]>([]);

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      const { data: st } = await supabase.from("server_stats").select("week_start, total_covers, total_sales").eq("venue_id", v).order("week_start", { ascending: false });
      const grouped = new Map<string, { covers: number; sales: number; servers: number }>();
      (st ?? []).forEach((r) => {
        const cur = grouped.get(r.week_start) || { covers: 0, sales: 0, servers: 0 };
        cur.covers += r.total_covers || 0;
        cur.sales += Number(r.total_sales || 0);
        cur.servers += 1;
        grouped.set(r.week_start, cur);
      });
      setWeeks(Array.from(grouped.entries()).map(([week_start, x]) => ({
        week_start, covers: x.covers, sales: x.sales, servers: x.servers, spc: x.covers > 0 ? x.sales / x.covers : 0,
      })));
    })();
  }, []);

  const currentWeek = toISODate(getMondayOfWeek());

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Week-by-week venue performance.</p>

        <div className="mt-6 rounded-2xl bg-white border border-border overflow-hidden">
          {weeks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No data yet. Upload weekly stats from the dashboard.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium">Week</th>
                  <th className="px-3 py-3 font-medium">Servers</th>
                  <th className="px-3 py-3 font-medium">Covers</th>
                  <th className="px-3 py-3 font-medium">Sales</th>
                  <th className="px-3 py-3 font-medium">SPC</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week_start} className="border-t border-border">
                    <td className="px-5 py-4 font-semibold">{formatWeekRange(w.week_start)} {w.week_start === currentWeek && <span className="ml-2 text-xs font-normal text-brand-green">current</span>}</td>
                    <td className="px-3">{w.servers}</td>
                    <td className="px-3">{w.covers.toLocaleString()}</td>
                    <td className="px-3">£{w.sales.toFixed(0)}</td>
                    <td className="px-3 font-semibold">£{w.spc.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}
