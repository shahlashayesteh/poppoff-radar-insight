import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- shared helpers ----------

const DAYPARTS = ["breakfast", "brunch", "lunch", "dinner", "late"] as const;
export type Daypart = (typeof DAYPARTS)[number];

async function getManagerVenueId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("venues")
    .select("id")
    .eq("manager_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("No venue found for this manager");
  return data.id as string;
}

function dayOfWeekISO(dateStr: string): number {
  // Returns 0 = Monday … 6 = Sunday (ISO)
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay(); // 0 sun .. 6 sat
  return js === 0 ? 6 : js - 1;
}

function dayPartFromTime(time: string | null | undefined): Daypart {
  if (!time) return "dinner";
  const h = parseInt(time.slice(0, 2), 10);
  if (Number.isNaN(h)) return "dinner";
  if (h < 10) return "breakfast";
  if (h < 12) return "brunch";
  if (h < 16) return "lunch";
  if (h < 22) return "dinner";
  return "late";
}

function hashServerId(name: string): string {
  // Deterministic synthetic id from name (no crypto needed)
  const n = name.trim().toLowerCase().replace(/\s+/g, "_");
  return `name:${n}`;
}

// ---------- column mapping CRUD ----------

export const getColumnMapping = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceType: "sales" | "labor" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data: row } = await supabase
      .from("venue_column_mappings")
      .select("mapping")
      .eq("venue_id", venueId)
      .eq("source_type", data.sourceType)
      .maybeSingle();
    return { mapping: (row?.mapping ?? {}) as Record<string, string> };
  });

export const saveColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceType: "sales" | "labor"; mapping: Record<string, string> }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { error } = await supabase
      .from("venue_column_mappings")
      .upsert(
        { venue_id: venueId, source_type: data.sourceType, mapping: data.mapping, updated_at: new Date().toISOString() },
        { onConflict: "venue_id,source_type" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- opportunity factors ----------

export const getOpportunityFactors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data, error } = await supabase
      .from("venue_opportunity_factors")
      .select("day_of_week, daypart, factor")
      .eq("venue_id", venueId);
    if (error) throw new Error(error.message);

    // Build full 7×5 grid with defaults
    const grid: Record<number, Record<Daypart, number>> = {};
    for (let dow = 0; dow < 7; dow++) {
      grid[dow] = {} as Record<Daypart, number>;
      for (const dp of DAYPARTS) grid[dow][dp] = 1.0;
    }
    for (const r of data ?? []) grid[r.day_of_week][r.daypart as Daypart] = Number(r.factor);
    return { grid };
  });

export const updateOpportunityFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dayOfWeek: number; daypart: Daypart; factor: number; weekStart: string }) =>
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      daypart: z.enum(DAYPARTS),
      factor: z.number().min(0.7).max(1.4),
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const clamped = Math.min(1.4, Math.max(0.7, Number(data.factor)));
    const { error } = await supabase
      .from("venue_opportunity_factors")
      .upsert(
        {
          venue_id: venueId,
          day_of_week: data.dayOfWeek,
          daypart: data.daypart,
          factor: clamped,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "venue_id,day_of_week,daypart" },
      );
    if (error) throw new Error(error.message);

    const { error: rpcErr } = await supabase.rpc("recalculate_lls_for_week", {
      p_venue_id: venueId,
      p_week_start: data.weekStart,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true, factor: clamped };
  });

// ---------- thresholds ----------

export const getLlsThresholds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data } = await supabase
      .from("venue_settings")
      .select("lls_green_threshold, lls_amber_threshold")
      .eq("venue_id", venueId)
      .maybeSingle();
    return {
      green: Number(data?.lls_green_threshold ?? 13.0),
      amber: Number(data?.lls_amber_threshold ?? 10.0),
    };
  });

// ---------- import shifts ----------

const ShiftRowInput = z.object({
  server_name: z.string().min(1),
  server_id: z.string().optional(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift_start_time: z.string().optional().nullable(),
  shift_end_time: z.string().optional().nullable(),
  covers_served: z.number().optional().nullable(),
  gross_sales: z.number().optional().nullable(),
  labor_cost: z.number().optional().nullable(),
});
type ShiftRowInput = z.infer<typeof ShiftRowInput>;

export const importShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceType: "sales" | "labor"; filename?: string; rows: ShiftRowInput[] }) =>
    z.object({
      sourceType: z.enum(["sales", "labor"]),
      filename: z.string().optional(),
      rows: z.array(ShiftRowInput).min(1).max(10000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);

    // Create batch
    const { data: batch, error: batchErr } = await supabase
      .from("shift_import_batches")
      .insert({
        venue_id: venueId,
        source_type: data.sourceType,
        filename: data.filename ?? null,
        row_count: data.rows.length,
        status: "completed",
        created_by: userId,
      })
      .select("id")
      .single();
    if (batchErr) throw new Error(batchErr.message);

    const batchId = batch.id as string;
    const errors: Array<{ row: number; error: string }> = [];
    const touchedKeys = new Set<string>();
    const weeks = new Set<string>();

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const serverId = (r.server_id?.trim() || hashServerId(r.server_name)).slice(0, 200);
        // Normalize start time so unique key works (NULL breaks uniqueness)
        const startTime = (r.shift_start_time && r.shift_start_time.length >= 5)
          ? r.shift_start_time
          : "00:00:00";
        const daypart = dayPartFromTime(startTime);
        const dow = dayOfWeekISO(r.shift_date);

        const baseRow: any = {
          venue_id: venueId,
          server_id: serverId,
          server_name: r.server_name,
          shift_date: r.shift_date,
          shift_start_time: startTime,
          shift_end_time: r.shift_end_time || null,
          daypart,
          day_of_week: dow,
        };
        if (data.sourceType === "sales") {
          baseRow.covers_served = r.covers_served ?? null;
          baseRow.gross_sales = r.gross_sales ?? null;
          baseRow.sales_batch_id = batchId;
        } else {
          baseRow.labor_cost = r.labor_cost ?? null;
          baseRow.labor_batch_id = batchId;
        }

        const { data: existing } = await supabase
          .from("shifts")
          .select("shift_id")
          .eq("venue_id", venueId)
          .eq("server_id", serverId)
          .eq("shift_date", r.shift_date)
          .eq("shift_start_time", startTime)
          .maybeSingle();

        let shiftId: string;
        if (existing?.shift_id) {
          shiftId = existing.shift_id;
          const { error: upErr } = await supabase
            .from("shifts")
            .update({ ...baseRow, updated_at: new Date().toISOString() })
            .eq("shift_id", shiftId);
          if (upErr) throw new Error(upErr.message);
        } else {
          const { data: ins, error: insErr } = await supabase
            .from("shifts")
            .insert(baseRow)
            .select("shift_id")
            .single();
          if (insErr) throw new Error(insErr.message);
          shiftId = ins.shift_id;
        }

        touchedKeys.add(shiftId);
        const d = new Date(r.shift_date + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        weeks.add(d.toISOString().slice(0, 10));
      } catch (err: any) {
        errors.push({ row: i + 1, error: err?.message || "Unknown error" });
      }
    }

    // Recalculate LLS for each touched shift
    for (const sid of touchedKeys) {
      await supabase.rpc("calculate_lls_for_shift", { p_shift_id: sid });
    }

    return {
      batchId,
      imported: touchedKeys.size,
      errors,
      weeks: Array.from(weeks),
    };
  });

export const rollbackBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batchId: string }) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);

    // Verify batch belongs to this venue
    const { data: batch } = await supabase
      .from("shift_import_batches")
      .select("id, source_type")
      .eq("id", data.batchId)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (!batch) throw new Error("Batch not found");

    if (batch.source_type === "sales") {
      // Clear sales fields on shifts where this is the sales_batch_id
      await supabase
        .from("shifts")
        .update({
          covers_served: null,
          gross_sales: null,
          rpc: null,
          base_lls: null,
          final_lls: null,
          sales_batch_id: null,
        })
        .eq("venue_id", venueId)
        .eq("sales_batch_id", data.batchId);
    } else {
      await supabase
        .from("shifts")
        .update({
          labor_cost: null,
          base_lls: null,
          final_lls: null,
          labor_batch_id: null,
        })
        .eq("venue_id", venueId)
        .eq("labor_batch_id", data.batchId);
    }

    // Delete shifts that have neither sales nor labor data left
    await supabase
      .from("shifts")
      .delete()
      .eq("venue_id", venueId)
      .is("sales_batch_id", null)
      .is("labor_batch_id", null);

    await supabase.from("shift_import_batches").delete().eq("id", data.batchId);
    return { ok: true };
  });

export const listRecentBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);
    const { data } = await supabase
      .from("shift_import_batches")
      .select("id, source_type, filename, row_count, status, created_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(10);
    return { batches: data ?? [] };
  });

// ---------- weekly scorecard ----------
//
// All metrics are derived from totals across worked shifts (not averages of averages).
//   weekly_rpc           = total_gross_sales / total_covers_served
//   weekly_base_lls      = total_gross_sales / total_labor_cost
//   weekly_adjusted_lls  = total_gross_sales / total_adjusted_labor_cost
//                          where total_adjusted_labor_cost = Σ(labor_cost × opportunity_factor)
// The DB column `shifts.final_lls` stores Adjusted LLS (Base LLS ÷ Opportunity Factor)
// — the legacy column name is kept for migration safety only. The API surfaces this
// as `adjusted_lls`; "Final LLS" is never exposed.

export type ScorecardDaily = { dow: number; adjusted_lls: number | null; shifts: number };

export type ScorecardServer = {
  serverId: string;
  serverName: string;
  daily: ScorecardDaily[];
  shifts_worked: number;
  weekly_rpc: number | null;
  weekly_base_lls: number | null;
  weekly_adjusted_lls: number | null;
  venue_benchmark: number | null;
  performance_gap: number | null;
  rag_status: "green" | "amber" | "red" | "none";
  operator_meaning: string;
  lowSample: boolean;
};

export type ScorecardResult = {
  weekStart: string;
  thresholds: { green: number; amber: number };
  servers: ScorecardServer[];
  venue_benchmark: number | null;
  venue_benchmark_prev: number | null;
  venue_benchmark_trend_pct: number | null;
  toReview: Array<{ serverId: string; serverName: string; reasons: string[] }>;
};

function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

function ragFromGap(gap: number | null): "green" | "amber" | "red" | "none" {
  if (gap == null || !Number.isFinite(gap)) return "none";
  if (gap >= 0.10) return "green";
  if (gap <= -0.10) return "red";
  return "amber";
}

function formatGapPct(gap: number | null): string {
  if (gap == null) return "—";
  const pct = gap * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function operatorMeaningFor(rag: "green" | "amber" | "red" | "none", gap: number | null): string {
  if (rag === "none" || gap == null) return "Not enough data to compare with venue benchmark";
  if (rag === "green") return `Outperforming venue benchmark by ${formatGapPct(gap).replace("+", "")}`;
  if (rag === "red") return `Below venue benchmark by ${formatGapPct(gap).replace("−", "")}`;
  return "Tracking with venue benchmark";
}

export const getWeeklyScorecard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { weekStart: string }) =>
    z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ScorecardResult> => {
    const { supabase, userId } = context;
    const venueId = await getManagerVenueId(supabase, userId);

    const ws = data.weekStart;
    const wsDate = new Date(ws + "T00:00:00");
    const weekEnd = new Date(wsDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const prevWeekStart = new Date(wsDate);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: vs } = await supabase
      .from("venue_settings")
      .select("lls_green_threshold, lls_amber_threshold")
      .eq("venue_id", venueId)
      .maybeSingle();
    const thresholds = {
      green: Number(vs?.lls_green_threshold ?? 13.0),
      amber: Number(vs?.lls_amber_threshold ?? 10.0),
    };

    // Pull current + prior week (prior week only powers the venue benchmark WoW trend).
    const { data: shifts, error } = await supabase
      .from("shifts")
      .select("server_id, server_name, shift_date, day_of_week, gross_sales, covers_served, labor_cost, opportunity_factor")
      .eq("venue_id", venueId)
      .gte("shift_date", iso(prevWeekStart))
      .lt("shift_date", iso(weekEnd));
    if (error) throw new Error(error.message);

    type Row = {
      server_id: string; server_name: string; shift_date: string; day_of_week: number;
      gross_sales: number | null; covers_served: number | null; labor_cost: number | null;
      opportunity_factor: number | null;
    };
    const all = (shifts ?? []) as Row[];
    const inCurrent = (d: string) => d >= ws && d < iso(weekEnd);
    const inPrev = (d: string) => d >= iso(prevWeekStart) && d < ws;

    // A shift counts as "worked" only when both sales and labor are present.
    const worked = (r: Row) =>
      r.gross_sales != null && Number(r.gross_sales) > 0 &&
      r.labor_cost != null && Number(r.labor_cost) > 0;

    type Totals = { gross: number; covers: number; labor: number; adjLabor: number; shifts: number };
    const emptyTotals = (): Totals => ({ gross: 0, covers: 0, labor: 0, adjLabor: 0, shifts: 0 });
    const accumulate = (t: Totals, r: Row) => {
      const of = r.opportunity_factor != null && Number(r.opportunity_factor) > 0 ? Number(r.opportunity_factor) : 1.0;
      t.gross += Number(r.gross_sales);
      t.covers += Number(r.covers_served ?? 0);
      t.labor += Number(r.labor_cost);
      t.adjLabor += Number(r.labor_cost) * of;
      t.shifts += 1;
    };

    // v1 benchmark method: venue-wide weekly Adjusted LLS for the same week.
    // Stable and simple by design. This will later evolve into a venue-specific
    // historical benchmark segmented by daypart, section, reservation density,
    // covers, spend environment, and service intensity. Do NOT add new tables
    // for that here.
    const venueCur = emptyTotals();
    const venuePrev = emptyTotals();
    for (const r of all) {
      if (!worked(r)) continue;
      if (inCurrent(r.shift_date)) accumulate(venueCur, r);
      else if (inPrev(r.shift_date)) accumulate(venuePrev, r);
    }
    const venue_benchmark = safeDiv(venueCur.gross, venueCur.adjLabor);
    const venue_benchmark_prev = safeDiv(venuePrev.gross, venuePrev.adjLabor);
    const venue_benchmark_trend_pct =
      venue_benchmark != null && venue_benchmark_prev != null && venue_benchmark_prev > 0
        ? ((venue_benchmark - venue_benchmark_prev) / venue_benchmark_prev) * 100
        : null;

    // Group current-week worked rows by server
    const byServer = new Map<string, { name: string; rows: Row[] }>();
    for (const r of all) {
      if (!inCurrent(r.shift_date) || !worked(r)) continue;
      if (!byServer.has(r.server_id)) byServer.set(r.server_id, { name: r.server_name, rows: [] });
      byServer.get(r.server_id)!.rows.push(r);
    }

    const servers: ScorecardServer[] = [];
    for (const [serverId, { name, rows }] of byServer) {
      const daily: ScorecardDaily[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const dayRows = rows.filter((r) => r.day_of_week === dow);
        if (!dayRows.length) {
          daily.push({ dow, adjusted_lls: null, shifts: 0 });
          continue;
        }
        const t = emptyTotals();
        dayRows.forEach((r) => accumulate(t, r));
        daily.push({ dow, adjusted_lls: safeDiv(t.gross, t.adjLabor), shifts: t.shifts });
      }

      const t = emptyTotals();
      rows.forEach((r) => accumulate(t, r));
      const weekly_rpc = safeDiv(t.gross, t.covers);
      const weekly_base_lls = safeDiv(t.gross, t.labor);
      const weekly_adjusted_lls = safeDiv(t.gross, t.adjLabor);

      const performance_gap =
        weekly_adjusted_lls != null && venue_benchmark != null && venue_benchmark > 0
          ? weekly_adjusted_lls / venue_benchmark - 1
          : null;
      const rag_status = ragFromGap(performance_gap);

      servers.push({
        serverId,
        serverName: name,
        daily,
        shifts_worked: t.shifts,
        weekly_rpc,
        weekly_base_lls,
        weekly_adjusted_lls,
        venue_benchmark,
        performance_gap,
        rag_status,
        operator_meaning: operatorMeaningFor(rag_status, performance_gap),
        lowSample: t.shifts < 3,
      });
    }

    const toReview: ScorecardResult["toReview"] = [];
    for (const s of servers) {
      if (s.lowSample) continue;
      const reasons: string[] = [];
      if (s.rag_status === "red") reasons.push(`Below venue benchmark (${formatGapPct(s.performance_gap)})`);
      if (s.shifts_worked > 5 && s.rag_status === "amber" && (s.performance_gap ?? 0) < 0) {
        reasons.push("Heavy week, tracking below benchmark");
      }
      if (reasons.length) toReview.push({ serverId: s.serverId, serverName: s.serverName, reasons });
    }

    servers.sort((a, b) => (b.weekly_adjusted_lls ?? -Infinity) - (a.weekly_adjusted_lls ?? -Infinity));

    return {
      weekStart: ws,
      thresholds,
      servers,
      venue_benchmark,
      venue_benchmark_prev,
      venue_benchmark_trend_pct,
      toReview,
    };
  });
