// Phase 9 — Manager Reports upgrade.
// Surfaces weekly trends with provenance, basis context, data quality
// status, and CSV export. Does not change LLS or import logic — only
// presents existing measured + derived values honestly.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { getManagerVenue } from "@/lib/manager-venue";
import { useRoleGate } from "@/lib/auth-gate";
import { getMondayOfWeek, toISODate, formatWeekRange } from "@/lib/week";
import { MetricTooltip } from "@/components/metrics";
import {
  OperationsStatusStrip,
  ProvenanceLegend,
} from "@/components/manager/operations-status-strip";
import { Download } from "lucide-react";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { getManagerReportsData } from "@/lib/manager-data.functions";

export const Route = createFileRoute("/manager/reports")({
  component: () => (
    <PaidManagerGate feature="reports">
      <Page />
    </PaidManagerGate>
  ),
});

type WeekRow = {
  week_start: string;
  covers: number;
  sales: number;
  servers: number;
  rpc: number; // derived — Σ sales / Σ covers
  wowSalesPct: number | null;
  wowRpcPct: number | null;
};

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: WeekRow[]) {
  const header = [
    "week_start",
    "servers",
    "covers (measured)",
    "sales (measured)",
    "rpc (derived)",
    "wow_sales_pct (derived)",
    "wow_rpc_pct (derived)",
  ].join(",");
  const body = rows
    .map((r) =>
      [
        r.week_start,
        r.servers,
        r.covers,
        r.sales.toFixed(2),
        r.rpc.toFixed(4),
        r.wowSalesPct === null ? "" : r.wowSalesPct.toFixed(2),
        r.wowRpcPct === null ? "" : r.wowRpcPct.toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `poppoff-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Page() {
  useRoleGate("manager");
  const fetchReports = useServerFn(getManagerReportsData);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) {
        setLoaded(true);
        return;
      }
      try {
        const res = await fetchReports({ data: { venueId: v } });
        setWeeks((res?.weeks ?? []) as WeekRow[]);
      } catch {
        setWeeks([]);
      }
      setLoaded(true);
    })();
  }, [fetchReports]);

  const currentWeek = toISODate(getMondayOfWeek());

  const summary = useMemo(() => {
    if (weeks.length === 0) return null;
    const cur = weeks[0];
    const prev = weeks[1];
    return {
      current: cur,
      previous: prev ?? null,
    };
  }, [weeks]);

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight">Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Week-by-week venue performance. Covers and sales are <em>measured</em>;
              RPC and week-on-week deltas are <em>derived</em>. For Adjusted LLS, RPH and
              recoverable-revenue trends, open the{" "}
              <Link to="/manager/lls" className="underline">LLS workspace</Link>.
            </p>
          </div>
          <button
            onClick={() => downloadCsv(weeks)}
            disabled={weeks.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        <OperationsStatusStrip />

        {/* Provenance / basis context — drives manager trust in the numbers. */}
        <div className="mt-4 rounded-2xl bg-white border border-border p-4">
          <div className="text-xs uppercase tracking-wider font-bold text-foreground/80">
            Basis & data quality
          </div>
          <ul className="mt-2 text-xs text-muted-foreground space-y-1">
            <li>
              <strong className="text-foreground/80">Sales basis:</strong> derived from
              <code className="mx-1">total_sales</code> as uploaded — net where available,
              otherwise gross. Mixed-basis warnings live on the LLS workspace.
            </li>
            <li>
              <strong className="text-foreground/80">Labour basis:</strong> not shown on this view —
              see <Link to="/manager/lls" className="underline">LLS</Link> for fully-loaded vs wage-only basis.
            </li>
            <li>
              <strong className="text-foreground/80">Confidence:</strong> depends on import quality
              (above) and identity matching. Rejected and warning rows are excluded from totals.
            </li>
            <li>
              No figure on this page is guaranteed revenue — historical totals only.
            </li>
          </ul>
          <ProvenanceLegend />
        </div>

        {/* Summary cards — Adjusted LLS / RPH live on the LLS workspace by design. */}
        {summary && (
          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <SummaryCard
              label="Sales this week"
              tooltip={{
                name: "Sales (measured)",
                description: "Sum of uploaded sales for the current week. Basis follows the source — net where available, otherwise gross.",
                formula: "Σ total_sales",
                sourceFields: ["total_sales"],
                provenance: "uploaded",
              }}
              value={`£${summary.current.sales.toFixed(0)}`}
              delta={summary.current.wowSalesPct}
            />
            <SummaryCard
              label="RPC this week"
              tooltip={{
                name: "Revenue per cover (RPC, derived)",
                description: "Average net spend per guest served this week.",
                formula: "Σ total_sales / Σ covers",
                sourceFields: ["total_sales", "total_covers"],
                provenance: "derived",
              }}
              value={`£${summary.current.rpc.toFixed(2)}`}
              delta={summary.current.wowRpcPct}
            />
            <SummaryCard
              label="Servers reporting"
              tooltip={{
                name: "Servers reporting (derived)",
                description: "Distinct servers with at least one stats row for the current week.",
                formula: "count(distinct user_id) where week_start = current",
                sourceFields: ["server_stats.user_id"],
                provenance: "derived",
              }}
              value={`${summary.current.servers}`}
            />
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-white border border-border overflow-hidden">
          {!loaded ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : weeks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No data yet. Upload weekly stats from the dashboard.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium">Week</th>
                  <th className="px-3 py-3 font-medium">Servers</th>
                  <th className="px-3 py-3 font-medium">Covers</th>
                  <th className="px-3 py-3 font-medium">Sales</th>
                  <th className="px-3 py-3 font-medium inline-flex items-center gap-1">
                    RPC
                    <MetricTooltip
                      name="Revenue per cover"
                      description="Average net spend per guest. Derived from uploaded sales and covers."
                      formula="Σ total_sales / Σ covers"
                      sourceFields={["total_sales", "total_covers"]}
                      provenance="derived"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">WoW sales</th>
                  <th className="px-3 py-3 font-medium">WoW RPC</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week_start} className="border-t border-border">
                    <td className="px-5 py-4 font-semibold">
                      {formatWeekRange(w.week_start)}{" "}
                      {w.week_start === currentWeek && (
                        <span className="ml-2 text-xs font-normal text-brand-green">current</span>
                      )}
                    </td>
                    <td className="px-3">{w.servers}</td>
                    <td className="px-3">{w.covers.toLocaleString()}</td>
                    <td className="px-3">£{w.sales.toFixed(0)}</td>
                    <td className="px-3 font-semibold">£{w.rpc.toFixed(2)}</td>
                    <td
                      className="px-3 font-semibold"
                      style={{
                        color:
                          w.wowSalesPct === null
                            ? undefined
                            : w.wowSalesPct >= 0
                              ? "var(--brand-green)"
                              : "var(--opportunity)",
                      }}
                    >
                      {w.wowSalesPct === null
                        ? "—"
                        : `${w.wowSalesPct >= 0 ? "+" : ""}${w.wowSalesPct.toFixed(1)}%`}
                    </td>
                    <td
                      className="px-3 font-semibold"
                      style={{
                        color:
                          w.wowRpcPct === null
                            ? undefined
                            : w.wowRpcPct >= 0
                              ? "var(--brand-green)"
                              : "var(--opportunity)",
                      }}
                    >
                      {w.wowRpcPct === null
                        ? "—"
                        : `${w.wowRpcPct >= 0 ? "+" : ""}${w.wowRpcPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          For Adjusted LLS trend, RPH trend, recoverable revenue and category-mix trend,
          open the <Link to="/manager/lls" className="underline">LLS workspace</Link>.
          Historical Shift Match Intelligence (suggested tests, not rota automation)
          also lives there.
        </p>
      </div>
    </ManagerLayout>
  );
}

function SummaryCard({
  label,
  value,
  tooltip,
  delta,
}: {
  label: string;
  value: string;
  tooltip: React.ComponentProps<typeof MetricTooltip>;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl bg-white border border-border p-4">
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
        {label}
        <MetricTooltip {...tooltip} />
      </div>
      <div className="font-display text-2xl font-extrabold mt-1">{value}</div>
      {delta !== undefined && (
        <div
          className="text-xs mt-1 font-semibold"
          style={{
            color:
              delta === null
                ? "var(--muted-foreground)"
                : delta >= 0
                  ? "var(--brand-green)"
                  : "var(--opportunity)",
          }}
        >
          {delta === null ? "no prior week" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% WoW (derived)`}
        </div>
      )}
    </div>
  );
}
