import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { toast } from "sonner";
import { ManagerLayout } from "@/components/manager-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMondayOfWeek, toISODate, formatWeekRange, previousMonday } from "@/lib/week";
import {
  importShifts,
  getWeeklyScorecard,
  getOpportunityFactors,
  updateOpportunityFactor,
  suggestOpportunityFactors,
  getColumnMapping,
  saveColumnMapping,
  listRecentBatches,
  rollbackBatch,
  type ScorecardResult,
  type Daypart,
} from "@/lib/lls.functions";
import { Upload, ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Trash2, Gauge, Sparkles } from "lucide-react";

export const Route = createFileRoute("/manager/lls")({ component: LlsPage });

const DAYPARTS: Daypart[] = ["breakfast", "brunch", "lunch", "dinner", "late"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Required mapping targets per source type
const SALES_FIELDS = [
  { key: "server_name", label: "Server name or ID", required: true },
  { key: "shift_date", label: "Shift date", required: true },
  { key: "covers_served", label: "Covers served", required: true },
  { key: "gross_sales", label: "Gross sales", required: true },
  { key: "daypart", label: "Daypart", required: false },
  { key: "shift_start_time", label: "Shift start time", required: false },
  { key: "shift_end_time", label: "Shift end time", required: false },
] as const;

const LABOR_FIELDS = [
  { key: "server_name", label: "Server name or ID", required: true },
  { key: "shift_date", label: "Shift date", required: true },
  { key: "labor_cost", label: "Labor cost", required: true },
  { key: "hours_worked", label: "Hours worked", required: false },
  { key: "hourly_rate", label: "Hourly rate", required: false },
  { key: "shift_start_time", label: "Shift start time", required: false },
  { key: "shift_end_time", label: "Shift end time", required: false },
] as const;

type ParsedFile = { headers: string[]; rows: Record<string, any>[]; filename: string };

async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows, filename: file.name };
  }
  const text = await file.text();
  const result = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data, filename: file.name };
}

function normalizeDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const uk = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (uk) {
    const yr = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${yr}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return toISODate(d);
}

function normalizeTime(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel time fraction
    const totalSec = Math.round(v * 86400);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:00`;
}

function normalizeNumber(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function llsBand(value: number | null, thresholds: { green: number; amber: number }): "green" | "amber" | "red" | "none" {
  if (value == null) return "none";
  if (value >= thresholds.green) return "green";
  if (value >= thresholds.amber) return "amber";
  return "red";
}

function formatGap(gap: number | null): string {
  if (gap == null) return "—";
  const pct = gap * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function bandBg(band: string, strong = false): string {
  if (band === "green") return strong ? "bg-brand-green/25 text-brand-green" : "bg-brand-green/10 text-brand-green";
  if (band === "amber") return strong ? "bg-brand-orange/25 text-brand-orange" : "bg-brand-orange/10 text-brand-orange";
  if (band === "red") return strong ? "bg-[color:var(--opportunity)]/25 text-[color:var(--opportunity)]" : "bg-[color:var(--opportunity)]/10 text-[color:var(--opportunity)]";
  return "bg-muted text-muted-foreground";
}

function LlsPage() {
  const [weekStart, setWeekStart] = useState(toISODate(getMondayOfWeek()));
  const [scorecard, setScorecard] = useState<ScorecardResult | null>(null);
  const [grid, setGrid] = useState<Record<number, Record<Daypart, number>> | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Upload state
  const [pendingFile, setPendingFile] = useState<ParsedFile | null>(null);
  const [pendingSource, setPendingSource] = useState<"sales" | "labor">("sales");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoDetected, setAutoDetected] = useState<Set<string>>(new Set());
  const [needsConfirm, setNeedsConfirm] = useState<Set<string>>(new Set());
  const [mappingOpen, setMappingOpen] = useState(false);

  const fetchScorecard = useServerFn(getWeeklyScorecard);
  const fetchOF = useServerFn(getOpportunityFactors);
  const updateOF = useServerFn(updateOpportunityFactor);
  const suggestOF = useServerFn(suggestOpportunityFactors);
  const doImport = useServerFn(importShifts);
  const loadMapping = useServerFn(getColumnMapping);
  const persistMapping = useServerFn(saveColumnMapping);
  const fetchBatches = useServerFn(listRecentBatches);
  const doRollback = useServerFn(rollbackBatch);

  const refresh = async () => {
    setLoading(true);
    try {
      const [sc, of, bs] = await Promise.all([
        fetchScorecard({ data: { weekStart } }),
        fetchOF(),
        fetchBatches(),
      ]);
      setScorecard(sc);
      setGrid(of.grid);
      setBatches(bs.batches);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const fieldsForSource = pendingSource === "sales" ? SALES_FIELDS : LABOR_FIELDS;

  const openUpload = async (source: "sales" | "labor", file: File) => {
    setPendingSource(source);
    const parsed = await parseFile(file);
    if (!parsed.headers.length) {
      toast.error("Could not read file headers");
      return;
    }
    const fieldsRO = source === "sales" ? SALES_FIELDS : LABOR_FIELDS;
    const fields = [...fieldsRO];
    const { mapping: auto, ambiguous } = autoMap(parsed.headers, fields);

    // Saved per-venue mapping wins over auto if its headers still exist.
    let saved: Record<string, string> = {};
    try {
      const r = await loadMapping({ data: { sourceType: source } });
      for (const [k, v] of Object.entries(r.mapping ?? {})) {
        if (typeof v === "string" && parsed.headers.includes(v)) saved[k] = v;
      }
    } catch {
      /* no saved mapping */
    }

    const merged: Record<string, string> = { ...auto, ...saved };
    // Saved choices override ambiguity for that field.
    for (const k of Object.keys(saved)) ambiguous.delete(k);

    const autoSet = new Set<string>([...Object.keys(auto), ...Object.keys(saved)]);

    // Figure out which required fields still need confirmation.
    const requiredKeys = fields.filter((f) => f.required).map((f) => f.key as string);
    const needs = new Set<string>();
    for (const k of requiredKeys) {
      if (!merged[k] || ambiguous.has(k)) needs.add(k);
    }
    // Labor: labor_cost can be derived from hours_worked × hourly_rate.
    if (
      source === "labor" &&
      needs.has("labor_cost") &&
      merged.hours_worked &&
      merged.hourly_rate &&
      !ambiguous.has("hours_worked") &&
      !ambiguous.has("hourly_rate")
    ) {
      needs.delete("labor_cost");
    }

    setPendingFile(parsed);
    setMapping(merged);
    setAutoDetected(autoSet);
    setNeedsConfirm(needs);

    if (needs.size === 0) {
      const isSavedExact =
        Object.keys(saved).length > 0 && requiredKeys.every((k) => saved[k] && saved[k] === merged[k]);
      await runImport(parsed, source, merged, {
        toastMessage: isSavedExact
          ? "Saved column mapping applied."
          : "Columns detected automatically. Importing file.",
      });
    } else {
      setMappingOpen(true);
    }
  };

  const runImport = async (
    file: ParsedFile,
    source: "sales" | "labor",
    map: Record<string, string>,
    opts: { toastMessage?: string } = {},
  ) => {
    // Build rows
    const rows = file.rows
      .map((r) => {
        const get = (k: string) => (map[k] ? r[map[k]] : null);
        const date = normalizeDate(get("shift_date"));
        const name = String(get("server_name") ?? "").trim();
        if (!date || !name) return null;
        const row: any = {
          server_name: name,
          shift_date: date,
          shift_start_time: normalizeTime(get("shift_start_time")) ?? undefined,
          shift_end_time: normalizeTime(get("shift_end_time")) ?? undefined,
        };
        if (source === "sales") {
          row.covers_served = normalizeNumber(get("covers_served"));
          row.gross_sales = normalizeNumber(get("gross_sales"));
        } else {
          let laborCost = normalizeNumber(get("labor_cost"));
          if (laborCost == null) {
            const hrs = normalizeNumber(get("hours_worked"));
            const rate = normalizeNumber(get("hourly_rate"));
            if (hrs != null && rate != null) laborCost = hrs * rate;
          }
          row.labor_cost = laborCost;
        }
        return row;
      })
      .filter(Boolean) as any[];

    if (!rows.length) {
      toast.error("No valid rows after mapping");
      return;
    }
    setLoading(true);
    try {
      await persistMapping({ data: { sourceType: source, mapping: map } });
      const res = await doImport({
        data: { sourceType: source, filename: file.filename, rows },
      });
      const base = opts.toastMessage
        ? `${opts.toastMessage} Imported ${res.imported} shifts`
        : `Imported ${res.imported} shifts`;
      toast.success(`${base}${res.errors.length ? ` (${res.errors.length} errors)` : ""}`);
      setMappingOpen(false);
      setPendingFile(null);
      setNeedsConfirm(new Set());
      setAutoDetected(new Set());
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    const required = fieldsForSource.filter((f) => f.required);
    for (const f of required) {
      if (!mapping[f.key]) {
        // Labor cost can be derived from hours × rate.
        if (
          pendingSource === "labor" &&
          f.key === "labor_cost" &&
          mapping.hours_worked &&
          mapping.hourly_rate
        ) {
          continue;
        }
        toast.error(`Map a column for "${f.label}"`);
        return;
      }
    }
    await runImport(pendingFile, pendingSource, mapping);
  };
    }
  };

  const setOF = async (dow: number, dp: Daypart, value: number) => {
    const clamped = Math.min(1.4, Math.max(0.7, value));
    setGrid((g) => (g ? { ...g, [dow]: { ...g[dow], [dp]: clamped } } : g));
    try {
      await updateOF({ data: { dayOfWeek: dow, daypart: dp, factor: clamped, weekStart } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update factor");
    }
  };

  const generateSuggestedFactors = async () => {
    setLoading(true);
    try {
      const res = await suggestOF();
      if (!res.enoughData) {
        toast.info("Not enough historical data yet. Start with 1.0 and refine after more uploads.");
        return;
      }
      setGrid(res.suggestions);
      for (let dow = 0; dow < 7; dow++) {
        for (const dp of DAYPARTS) {
          const f = res.suggestions[dow][dp];
          await updateOF({ data: { dayOfWeek: dow, daypart: dp, factor: f, weekStart } });
        }
      }
      toast.success("Suggested factors applied. Edit any cell to fine-tune.");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  };

  const prevWk = () => setWeekStart(toISODate(previousMonday(new Date(weekStart + "T00:00:00"))));
  const nextWk = () => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + 7);
    setWeekStart(toISODate(d));
  };

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-7xl">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Manager · Labor Leverage</div>
        <div className="mt-2 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight flex items-center gap-3">
              <Gauge className="h-8 w-8" /> Labor Leverage Score
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Compare server LLS against the venue benchmark using sales, covers, labor cost, and shift opportunity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevWk}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-semibold px-2 min-w-[160px] text-center">{formatWeekRange(weekStart)}</div>
            <Button variant="outline" size="sm" onClick={nextWk}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Venue summary */}
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Venue Benchmark"
            value={scorecard?.venue_benchmark != null ? `${scorecard.venue_benchmark.toFixed(2)}x weekly LLS` : "—"}
            helper="Venue weekly LLS used as the benchmark for this scorecard."
          />
          <SummaryCard
            label="Benchmark WoW Trend"
            value={scorecard?.venue_benchmark_trend_pct != null ? `${scorecard.venue_benchmark_trend_pct > 0 ? "+" : ""}${scorecard.venue_benchmark_trend_pct.toFixed(1)}%` : "—"}
            trend={scorecard?.venue_benchmark_trend_pct ?? null}
            helper="How the venue benchmark changed versus last week."
          />
          <SummaryCard
            label="Servers Tracked"
            value={String(scorecard?.servers.length ?? 0)}
            helper="Servers with both sales and labor data this week."
          />
        </div>

        {/* Upload card */}
        <div className="mt-6 rounded-2xl bg-white border border-border p-6">
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><Upload className="h-4 w-4" /> Import shift data</h2>
          <p className="mt-1 text-xs text-muted-foreground">CSV or XLSX from any POS or back-office system. Upload sales and labor separately — they merge by server + date + start time.</p>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <UploadZone label="Sales export" sublabel="Required: server name or ID, shift date, daypart, covers served, gross sales" onFile={(f) => openUpload("sales", f)} />
            <UploadZone label="Labor export" sublabel="Required: server name or ID, shift date, start time, end time or hours worked, labor cost" onFile={(f) => openUpload("labor", f)} />
          </div>
          {batches.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Recent imports</div>
              <div className="space-y-1.5">
                {batches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-2 bg-muted/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs uppercase font-bold text-muted-foreground">{b.source_type}</span>
                      <span className="truncate">{b.filename || "(no filename)"}</span>
                      <span className="text-xs text-muted-foreground">{b.row_count} rows</span>
                    </div>
                    <button
                      className="text-xs text-muted-foreground hover:text-[color:var(--opportunity)] flex items-center gap-1"
                      onClick={async () => {
                        if (!confirm("Roll back this batch?")) return;
                        try {
                          await doRollback({ data: { batchId: b.id } });
                          toast.success("Batch rolled back");
                          await refresh();
                        } catch (e: any) {
                          toast.error(e?.message ?? "Rollback failed");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Rollback
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scorecard */}
        <div className="mt-6 rounded-2xl bg-white border border-border p-6">
          <h2 className="font-display text-lg font-bold">Weekly scorecard</h2>
          {scorecard?.servers.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-3">Server</th>
                    {DAY_LABELS.map((d) => (
                      <th key={d} className="text-center py-2 px-1.5 w-14">{d}</th>
                    ))}
                    <th className="text-right py-2 px-2">Shifts</th>
                    <th
                      className="text-right py-2 px-2"
                      title="Total Weekly Gross Sales ÷ Total Weekly Covers Served. Shows how well each server monetises each guest."
                    >Weekly RPC</th>
                    <th
                      className="text-right py-2 px-2"
                      title="Total Weekly Gross Sales ÷ Total Weekly Labor Cost. Shows sales generated for every £1 of labor."
                    >Base LLS</th>
                    <th
                      className="text-right py-2 px-2"
                      title="Total Weekly Gross Sales ÷ Total Weekly Adjusted Labor Cost (labor cost × opportunity factor)."
                    >LLS</th>
                    <th className="text-right py-2 px-2">Venue Benchmark</th>
                    <th
                      className="text-right py-2 px-2"
                      title="LLS ÷ Venue Benchmark − 1. How far the server is above or below the venue benchmark."
                    >Gap</th>
                    <th className="text-left py-2 pl-3">Operator meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.servers.map((s) => (
                    <tr key={s.serverId} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-semibold">
                        {s.serverName}
                        {s.lowSample && (
                          <span className="ml-2 text-[10px] uppercase text-muted-foreground" title="Fewer than 3 shifts">low sample</span>
                        )}
                      </td>
                      {s.daily.map((day, i) => (
                        <td key={i} className="text-center py-1 px-1">
                          <div className="mx-auto rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground">
                            {day.adjusted_lls != null ? day.adjusted_lls.toFixed(1) : "—"}
                          </div>
                        </td>
                      ))}
                      <td className="text-right py-2 px-2 text-muted-foreground">{s.shifts_worked}</td>
                      <td className="text-right py-2 px-2">{s.weekly_rpc != null ? s.weekly_rpc.toFixed(2) : "—"}</td>
                      <td className="text-right py-2 px-2">{s.weekly_base_lls != null ? s.weekly_base_lls.toFixed(2) : "—"}</td>
                      <td className="text-right py-2 px-2">
                        <div className={`inline-block rounded-md px-2 py-1 font-bold ${bandBg(s.rag_status, true)}`}>
                          {s.weekly_adjusted_lls != null ? s.weekly_adjusted_lls.toFixed(2) : "—"}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 text-muted-foreground">
                        {s.venue_benchmark != null ? s.venue_benchmark.toFixed(2) : "—"}
                      </td>
                      <td className="text-right py-2 px-2 font-semibold">{formatGap(s.performance_gap)}</td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground">{s.operator_meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No shifts yet for this week. Import sales and labor data to begin.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${bandBg("green", true).split(" ")[0]}`} /> Strong LLS: 10%+ above benchmark</span>
            <span className="flex items-center gap-1.5"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${bandBg("amber", true).split(" ")[0]}`} /> Average LLS: within ±10% of benchmark</span>
            <span className="flex items-center gap-1.5"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${bandBg("red", true).split(" ")[0]}`} /> Weak LLS: 10%+ below benchmark</span>
          </div>
        </div>


        {/* Servers to review */}
        {scorecard && scorecard.toReview.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[color:var(--opportunity)]/30 bg-[color:var(--opportunity)]/5 p-6">
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[color:var(--opportunity)]" />
              Servers to review
            </h2>
            <div className="mt-3 space-y-2">
              {scorecard.toReview.map((s) => (
                <div key={s.serverId} className="flex items-center justify-between text-sm rounded-lg px-3 py-2 bg-white border border-border">
                  <span className="font-semibold">{s.serverName}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {s.reasons.map((r, i) => (
                      <span key={i} className="text-xs rounded-full px-2 py-0.5 bg-[color:var(--opportunity)]/10 text-[color:var(--opportunity)]">{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opportunity Factor editor */}
        <div className="mt-6 rounded-2xl bg-white border border-border p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="font-display text-lg font-bold">Opportunity Factor grid</h2>
            <Button variant="outline" size="sm" onClick={generateSuggestedFactors} disabled={loading}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Generate suggested factors from venue data
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Opportunity Factors are venue-specific. A Saturday afternoon can be quiet in one venue and one of the strongest shifts of the week in another. PoppOff benchmarks each server against what this venue normally expects from that type of shift. Range 0.7–1.4.
          </p>
          <div className="mt-3 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">How to use this</div>
            <div>1.0 means normal opportunity for this venue.</div>
            <div>Below 1.0 means the shift usually has lower sales opportunity.</div>
            <div>Above 1.0 means the shift usually has stronger sales opportunity.</div>
            <div className="pt-1">Start with 1.0 if unsure. Refine the factors after uploading historical venue data.</div>
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-md border border-border p-2">
              <div className="font-semibold text-foreground">Low opportunity: 0.75 to 0.90</div>
              <div>Quiet shift, low covers, weaker spend environment</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="font-semibold text-foreground">Normal opportunity: 0.95 to 1.05</div>
              <div>Typical trading conditions</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="font-semibold text-foreground">Strong opportunity: 1.10 to 1.25</div>
              <div>Busy shift, strong reservations, good spend environment</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="font-semibold text-foreground">Peak opportunity: 1.30 to 1.40</div>
              <div>Premium section, high demand, high covers, strong spend environment</div>
            </div>
          </div>
          <p className="mt-3 text-xs rounded-md bg-muted/60 p-2 text-muted-foreground">
            Changes apply to this week's shifts only. Past weeks keep their original scores.
          </p>
          {grid && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-3">Day</th>
                    {DAYPARTS.map((dp) => (
                      <th key={dp} className="text-center py-2 px-2 capitalize">{dp}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_LABELS.map((label, dow) => (
                    <tr key={dow} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-semibold">{label}</td>
                      {DAYPARTS.map((dp) => (
                        <td key={dp} className="text-center py-1 px-1">
                          <Input
                            type="number"
                            step="0.05"
                            min={0.7}
                            max={1.4}
                            value={grid[dow][dp]}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setGrid((g) => (g ? { ...g, [dow]: { ...g[dow], [dp]: v } } : g));
                            }}
                            onBlur={(e) => setOF(dow, dp, Number(e.target.value))}
                            className="w-20 h-8 text-center text-xs mx-auto"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Column mapping modal */}
      <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Map your columns</DialogTitle>
          </DialogHeader>
          {pendingFile && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                File: <span className="font-mono">{pendingFile.filename}</span> · {pendingFile.rows.length} rows · {pendingSource} upload
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {fieldsForSource.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">
                      {f.label} {f.required && <span className="text-[color:var(--opportunity)]">*</span>}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? ""}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="— select column —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— none —</SelectItem>
                        {pendingFile.headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingOpen(false)}>Cancel</Button>
            <Button onClick={confirmImport} disabled={loading}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}

function SummaryCard({ label, value, band, trend, helper }: { label: string; value: string; band?: string; trend?: number | null; helper?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-border p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className={`text-3xl font-extrabold font-display ${band ? bandBg(band, true).replace(/bg-[^ ]+/, "") : ""}`}>{value}</div>
        {trend != null && (
          trend >= 0
            ? <TrendingUp className="h-4 w-4 text-brand-green" />
            : <TrendingDown className="h-4 w-4 text-[color:var(--opportunity)]" />
        )}
      </div>
      {helper && <div className="mt-2 text-xs text-muted-foreground">{helper}</div>}
    </div>
  );
}

function UploadZone({ label, sublabel, onFile }: { label: string; sublabel: string; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      className={`flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${drag ? "border-brand-green bg-brand-green/5" : "border-border hover:bg-muted/40"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <Upload className="h-5 w-5 text-muted-foreground" />
      <div className="mt-2 text-sm font-semibold">{label}</div>
      <div className="text-xs text-muted-foreground">{sublabel}</div>
      <div className="mt-1 text-xs text-muted-foreground">Drop CSV/XLSX or click</div>
      <input
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// Heuristic auto-mapping with ambiguity detection.
// Returns the best header per field plus a set of fields where multiple
// headers tied at the highest-confidence (lowest-priority) match — those
// must be confirmed by the manager rather than guessed silently.
function autoMap(
  headers: string[],
  fields: ReadonlyArray<{ key: string }>,
): { mapping: Record<string, string>; ambiguous: Set<string> } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Priority order matters: earlier entries are stronger matches.
  const SYN: Record<string, string[]> = {
    server_name: [
      "servername", "server", "employeename", "employee", "staffname", "staff",
      "waitername", "waiter", "teammembername", "teammember", "username", "user",
      "operator", "cashier", "soldby", "name",
    ],
    shift_date: [
      "businessdate", "shiftdate", "tradingdate", "transactiondate", "orderdate",
      "saledate", "servicedate", "date", "day",
    ],
    daypart: ["daypart", "mealperiod", "serviceperiod", "service", "period", "session"],
    covers_served: [
      "coversserved", "coverscount", "coverstotal", "guestsserved", "guestcount",
      "covers", "guests", "pax", "customers",
    ],
    gross_sales: [
      "grosssales", "grossrevenue", "grosstotal", "totalsales", "salestotal",
      "sales", "revenue", "amount", "total", "netsales",
    ],
    shift_start_time: [
      "shiftstart", "clockin", "starttime", "intime", "timein", "start",
    ],
    shift_end_time: [
      "shiftend", "clockout", "endtime", "outtime", "timeout", "end",
    ],
    labor_cost: [
      "laborcost", "labourcost", "wagecost", "payrollcost", "staffcost",
      "employeecost", "totalpay", "wages", "pay", "cost",
    ],
    hours_worked: [
      "hoursworked", "paidhours", "shifthours", "totalhours", "workedhours", "hours",
    ],
    hourly_rate: ["hourlyrate", "wagerate", "hourlypay", "payrate", "rate"],
  };

  const mapping: Record<string, string> = {};
  const ambiguous = new Set<string>();
  for (const f of fields) {
    const syns = SYN[f.key] ?? [f.key.replace(/_/g, "")];
    let best: { header: string; prio: number } | null = null;
    let tied = false;
    for (const h of headers) {
      const prio = syns.indexOf(norm(h));
      if (prio === -1) continue;
      if (!best || prio < best.prio) {
        best = { header: h, prio };
        tied = false;
      } else if (prio === best.prio) {
        tied = true;
      }
    }
    if (best) {
      mapping[f.key] = best.header;
      if (tied) ambiguous.add(f.key);
    }
  }
  return { mapping, ambiguous };
}
