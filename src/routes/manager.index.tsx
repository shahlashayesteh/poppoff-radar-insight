import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGate } from "@/lib/auth-gate";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  PoundSterling,
  TrendingUp,
  Eye,
  Wine,
  Target,
  Copy,
  Upload,
  Download,
  RefreshCw,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { downloadCsvTemplate, ensureCategories, parseStatsCsv, type CsvRow } from "@/lib/csv";
import {
  getMondayOfWeek,
  toISODate,
  formatWeekRange,
  performanceColour,
  performanceTone,
  latestStatsWeek,
} from "@/lib/week";
import { getManagerVenue } from "@/lib/manager-venue";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/")({ component: ManagerDashboard });

type Venue = { id: string; name: string; join_code: string };
type Member = { id: string; full_name: string | null };
type StatRow = {
  user_id: string;
  total_covers: number;
  total_sales: number;
  spend_per_cover: number | null;
  wine_conversion: number | null;
  dessert_conversion: number | null;
  cocktail_conversion: number | null;
  sides_conversion: number | null;
  spirits_conversion: number | null;
  sparkling_conversion: number | null;
};
type TargetRow = {
  user_id: string;
  spend_per_cover_target: number;
  wine_target: number;
  dessert_target: number;
  cocktail_target: number;
  sides_target: number;
  spirits_target: number;
  sparkling_target: number;
};

type StatProps = {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string | number;
  sub?: string;
};

const Stat = ({ icon: Icon, tone, label, value, sub }: StatProps) => (
  <div className="rounded-2xl bg-white border border-border p-4">
    <div className="flex items-start gap-3">
      <div
        className="h-11 w-11 rounded-full grid place-items-center"
        style={{ background: `color-mix(in oklab, ${tone} 14%, white)` }}
      >
        <Icon className="h-5 w-5" style={{ color: tone }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-extrabold mt-0.5">{value}</div>
        {sub && <div className="text-xs mt-1 text-muted-foreground">{sub}</div>}
      </div>
    </div>
  </div>
);

const Dot = ({ s }: { s: "green" | "amber" | "red" }) => (
  <span
    className="inline-block h-3 w-3 rounded-full"
    style={{
      background:
        s === "green"
          ? "var(--brand-green)"
          : s === "amber"
            ? "var(--brand-orange)"
            : "var(--opportunity)",
    }}
  />
);

function ManagerDashboard() {
  useRoleGate("manager");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [views, setViews] = useState<Record<string, boolean>>({});
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<CsvRow[] | null>(null);
  const [previewWeek, setPreviewWeek] = useState<string>("");
  const [previewConfidence, setPreviewConfidence] = useState<number>(1);
  const [previewNotes, setPreviewNotes] = useState<string>("");
  const weekStart = useMemo(() => toISODate(getMondayOfWeek()), []);
  const [displayWeekStart, setDisplayWeekStart] = useState<string>(weekStart);

  const load = async () => {
    const v = await getManagerVenue();
    if (!v) return;
    setVenue(v);
    const { data: vm } = await supabase
      .from("venue_members")
      .select("user_id")
      .eq("venue_id", v.id);
    const ids = (vm ?? []).map((x) => x.user_id);
    let mems: Member[] = [];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      mems = profs ?? [];
    }
    setMembers(mems);
    const visibleWeek = await latestStatsWeek(
      supabase
        .from("server_stats")
        .select("week_start, created_at")
        .eq("venue_id", v.id)
        .order("created_at", { ascending: false })
        .order("week_start", { ascending: false })
        .limit(1),
      weekStart,
    );
    setDisplayWeekStart(visibleWeek);
    const { data: st } = await supabase
      .from("server_stats")
      .select("*")
      .eq("venue_id", v.id)
      .eq("week_start", visibleWeek);
    setStats((st ?? []) as StatRow[]);
    const { data: tg } = await supabase.from("server_targets").select("*").eq("venue_id", v.id);
    setTargets((tg ?? []) as TargetRow[]);
    const { data: vw } = await supabase
      .from("server_stat_views")
      .select("user_id")
      .eq("venue_id", v.id)
      .eq("week_start", visibleWeek);
    setViews(Object.fromEntries((vw ?? []).map((r) => [r.user_id, true])));
    const { data: ak } = await supabase
      .from("server_focus_acks")
      .select("user_id")
      .eq("venue_id", v.id)
      .eq("week_start", visibleWeek);
    setAcks(Object.fromEntries((ak ?? []).map((r) => [r.user_id, true])));
  };

  useEffect(() => {
    load();
  }, [weekStart]);

  const totals = useMemo(() => {
    const covers = stats.reduce((a, s) => a + (s.total_covers || 0), 0);
    const sales = stats.reduce((a, s) => a + Number(s.total_sales || 0), 0);
    const spc = covers > 0 ? sales / covers : 0;
    return { covers, sales, spc };
  }, [stats]);

  const targetByUser = useMemo(
    () => Object.fromEntries(targets.map((t) => [t.user_id, t])),
    [targets],
  );
  const statByUser = useMemo(() => Object.fromEntries(stats.map((s) => [s.user_id, s])), [stats]);

  const copyCode = async () => {
    if (!venue) return;
    const code = venue.join_code;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Join code copied");
    } catch {
      // fallback: prompt user to copy manually
      window.prompt("Copy this join code:", code);
    }
  };

  const regenerate = async () => {
    if (!venue) return;
    const { data, error } = await supabase.rpc("regenerate_venue_join_code", {
      _venue_id: venue.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setVenue({ ...venue, join_code: String(data) });
    toast.success("New join code generated");
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      // Compress/downscale images before OCR to stay under edge body limits
      // and reduce OpenAI/Gemini latency. Non-images pass through unchanged.
      if (!file.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = () => reject(r.error || new Error("read failed"));
        r.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const MAX = 1600;
            let { width: w, height: h } = img;
            if (w > MAX || h > MAX) {
              const k = Math.min(MAX / w, MAX / h);
              w = Math.round(w * k);
              h = Math.round(h * k);
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(String(reader.result || ""));
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.82));
          } catch {
            resolve(String(reader.result || ""));
          }
        };
        img.onerror = () => resolve(String(reader.result || ""));
        img.src = String(reader.result || "");
      };
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.readAsDataURL(file);
    });

  const importRows = async (rows: CsvRow[], fileCount: number, sourceLabel: string) => {
    if (!venue) return;
    const importWeek = rows[0]?.week_start || weekStart;
    const importedWeeks = new Set<string>();
    const createdNames = new Set<string>();
    setUploadStatus(`Preparing dashboard… importing ${rows.length} server row${rows.length === 1 ? "" : "s"}…`);
    const normalizedRows = rows.map(ensureCategories);
    const { data, error } = await supabase.rpc("process_csv_upload", {
      _venue_id: venue.id,
      _week_start: importWeek,
      _csv_data: normalizedRows as unknown as never,
    });
    if (error) throw error;
    const result = data as {
      matched_count: number;
      created_count?: number;
      unmatched_names?: string[];
      weeks?: string[];
    };
    const importedCount = result.matched_count || 0;
    (result.weeks?.length ? result.weeks : rows.map((row) => row.week_start || importWeek)).forEach(
      (week) => importedWeeks.add(week),
    );
    (result.unmatched_names ?? []).forEach((name) => createdNames.add(name));

    const weeks = Array.from(importedWeeks);
    toast.success(
      `Imported ${importedCount} server week${importedCount === 1 ? "" : "s"} from ${fileCount} ${sourceLabel}${fileCount === 1 ? "" : "s"}`,
    );
    if (createdNames.size > 0) {
      toast.info(
        `Added ${createdNames.size} new server${createdNames.size === 1 ? "" : "s"} to your team: ${Array.from(createdNames).join(", ")}`,
      );
    }
    setUploadStatus("Refreshing dashboards and generating priorities…");
    toast.info("Generating weekly priorities with AI…");
    await Promise.all(
      weeks.map(async (week) => {
        const { error: aiErr } = await supabase.functions.invoke("ai-assist", {
          body: {
            action: "generate_priorities",
            venueId: venue.id,
            payload: { weekStart: week },
          },
        });
        if (aiErr) {
          let msg = aiErr.message;
          try {
            const j = await (aiErr as any).context?.json?.();
            if (j?.error) msg = j.error;
          } catch { /* ignore */ }
          toast.error(`AI: ${msg}`);
        }
      }),
    );
    setDisplayWeekStart(weeks[0] || importWeek);
    await load();
    setUploadStatus(`Imported ${importedCount} server week${importedCount === 1 ? "" : "s"}.`);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (!venue) {
      toast.error("Your venue is still loading — try again in a moment");
      return;
    }
    const isImage = (f: File) =>
      f.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(f.name);
    const allImages = files.every(isImage);
    const allCsv = files.every((f) => !isImage(f));
    if (!allImages && !allCsv) {
      toast.error("Please upload either CSV files OR image files, not both at once.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      if (allImages) {
        setUploadStatus(`Reading image${files.length === 1 ? "" : "s"}…`);
        const dataUrls = await Promise.all(files.map(fileToDataUrl));
        setUploadStatus("Extracting report data…");
        const { data, error } = await supabase.functions.invoke("ai-assist", {
          body: {
            action: "parse_stats_image",
            venueId: venue.id,
            payload: { images: dataUrls },
          },
        });
        if (error) {
          let msg = error.message;
          try {
            const j = await (error as any).context?.json?.();
            if (j?.error) msg = j.error;
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        const result = data as {
          rows: CsvRow[];
          confidence: number;
          week_start: string | null;
          notes: string;
        };
        if (!result.rows?.length || result.confidence < 0.5) {
          const msg = "We could not confidently extract this report. Please upload a clearer image or use CSV.";
          setUploadStatus(msg);
          toast.error(msg);
          return;
        }
        setPreviewRows(result.rows.map(ensureCategories));
        setPreviewWeek(result.week_start || weekStart);
        setPreviewConfidence(result.confidence);
        setPreviewNotes(result.notes || "");
        setUploadStatus(`Extracted ${result.rows.length} server row${result.rows.length === 1 ? "" : "s"} — review below.`);
        return;
      }

      setUploadStatus(`Reading ${files.length} CSV${files.length === 1 ? "" : "s"}…`);
      const parsed = await Promise.all(files.map(parseStatsCsv));
      const rows = parsed.flat();
      if (!rows.length) {
        const message =
          "No server sales rows were found. The CSV needs at least a staff/server name plus sales, covers, or item/category amounts.";
        setUploadStatus(message);
        toast.error(message);
        return;
      }
      await importRows(rows, files.length, "CSV");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadStatus(message);
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updatePreviewRow = (idx: number, field: keyof CsvRow, value: string) => {
    setPreviewRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const row = { ...next[idx] };
      if (field === "server_name") {
        row.server_name = value;
      } else if (field === "week_start") {
        row.week_start = value;
      } else {
        (row as Record<string, unknown>)[field] = Number(value) || 0;
      }
      next[idx] = row;
      return next;
    });
  };

  const updatePreviewCategory = (idx: number, key: string, value: string) => {
    setPreviewRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const row = { ...next[idx] };
      const cats = { ...(row.categories || {}) };
      const existing = cats[key] || { label: key, sales: 0, quantity: 0, metric_type: "sales" as const };
      cats[key] = { ...existing, sales: Number(value) || 0 };
      row.categories = cats;
      next[idx] = row;
      return next;
    });
  };

  const removePreviewRow = (idx: number) => {
    setPreviewRows((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  };

  const confirmPreview = async () => {
    if (!previewRows || !previewRows.length) return;
    setUploading(true);
    try {
      const rows = previewRows
        .map((r) => ({ ...r, week_start: r.week_start || previewWeek || weekStart }))
        .filter((r) => r.server_name.trim() && (r.total_sales > 0 || r.total_covers > 0));
      if (!rows.length) {
        toast.error("No valid rows to import.");
        return;
      }
      await importRows(rows, 1, "image");
      setPreviewRows(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setUploadStatus(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const deleteAllUploads = async () => {
    if (!venue) return;
    if (
      !window.confirm(
        "Delete ALL uploaded CSV stats for this venue? This removes every week of server stats, views, acks, coaching and priorities. This cannot be undone.",
      )
    )
      return;
    try {
      const { data, error } = await supabase.rpc("delete_csv_uploads", {
        _venue_id: venue.id,
        _weeks: null as unknown as never,
      });
      if (error) throw error;
      const result = data as { deleted_rows: number };
      toast.success(`Deleted ${result?.deleted_rows ?? 0} stat rows`);
      setUploadStatus("All uploaded CSV data deleted.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error(message);
    }
  };

  const cats: Array<{ key: keyof StatRow; tKey: keyof TargetRow; label: string }> = [
    { key: "wine_conversion", tKey: "wine_target", label: "Wine" },
    { key: "cocktail_conversion", tKey: "cocktail_target", label: "Cocktails" },
    { key: "dessert_conversion", tKey: "dessert_target", label: "Desserts" },
    { key: "sides_conversion", tKey: "sides_target", label: "Sides" },
    { key: "spirits_conversion", tKey: "spirits_target", label: "Spirits" },
    { key: "sparkling_conversion", tKey: "sparkling_target", label: "Sparkling" },
  ];

  const viewedCount = members.filter((m) => views[m.id]).length;
  const ackedCount = members.filter((m) => acks[m.id]).length;

  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div
              className="font-display text-2xl font-extrabold tracking-tight uppercase"
              style={{ color: "var(--brand-green)" }}
            >
              Manager Dashboard
            </div>
            <div className="text-sm text-muted-foreground tracking-widest uppercase">
              {venue?.name || "Loading..."}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">{formatWeekRange(displayWeekStart)}</div>
        </div>

        {/* Join code + CSV upload */}
        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <div
            className="rounded-2xl p-5 border-2"
            style={{
              borderColor: "var(--brand-green)",
              background: "color-mix(in oklab, var(--brand-green) 6%, white)",
            }}
          >
            <div className="text-xs uppercase tracking-widest text-brand-green font-bold">
              Team join code
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <div className="font-display text-5xl font-extrabold tracking-widest text-brand-green">
                {venue?.join_code || "······"}
              </div>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
              <button
                onClick={regenerate}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" /> New code
              </button>
            </div>
            <p className="mt-3 text-sm text-foreground/75">
              Share this code with your team. Servers enter it at{" "}
              <span className="font-mono">/join</span> to link their account to your venue.
            </p>
          </div>

          <div className="rounded-2xl p-5 border border-border bg-white">
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
              Upload weekly stats
            </div>
            <p className="mt-2 text-sm text-foreground/75">
              Upload a stats CSV or a photo/screenshot (PNG/JPEG) of a server-performance report. We
              auto-detect names, totals, covers and categories. Images go through OCR and you can
              review &amp; edit before importing.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <label
                className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white overflow-hidden ${uploading || !venue ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                style={{ background: "var(--brand-orange)" }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,.png,.jpg,.jpeg,image/png,image/jpeg"
                  multiple
                  onChange={onFile}
                  disabled={uploading || !venue}
                  aria-label="Upload weekly stats CSV or image"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload CSV or Image"}
              </label>
              <button
                onClick={downloadCsvTemplate}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"
              >
                <Download className="h-4 w-4" /> Template
              </button>
              <button
                onClick={deleteAllUploads}
                disabled={uploading || !venue || stats.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 text-destructive px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-destructive/5"
              >
                <Trash2 className="h-4 w-4" /> Delete all uploads
              </button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              If the file has dates, those weeks are used. If not, the filename date or current week
              is used.
            </div>
            {uploadStatus && (
              <div className="mt-2 text-xs font-semibold text-foreground/80">{uploadStatus}</div>
            )}
          </div>
        </div>

        {previewRows && (
          <div className="mt-6 rounded-2xl border-2 border-brand-orange bg-white p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-widest font-bold" style={{ color: "var(--brand-orange)" }}>
                  Extracted Data Preview
                </div>
                <h3 className="font-display text-lg font-bold mt-1">
                  Review &amp; edit before importing
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  OCR confidence: {Math.round(previewConfidence * 100)}%
                  {previewNotes ? ` — ${previewNotes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Week starting</label>
                <input
                  type="date"
                  value={previewWeek}
                  onChange={(e) => setPreviewWeek(e.target.value)}
                  className="rounded-lg border border-border px-2 py-1 text-sm"
                />
              </div>
            </div>
            {(() => {
              // Build the union of all category keys present across preview rows,
              // so the table adapts to whatever categories the venue actually has.
              const catKeyMap = new Map<string, string>();
              for (const row of previewRows) {
                if (row.categories) {
                  for (const [key, entry] of Object.entries(row.categories)) {
                    if (!catKeyMap.has(key)) catKeyMap.set(key, entry.label || key);
                  }
                }
              }
              const catCols = Array.from(catKeyMap.entries()).map(([key, label]) => ({ key, label }));
              return (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-2 font-medium">Server</th>
                        <th className="px-2 py-2 font-medium">Covers</th>
                        <th className="px-2 py-2 font-medium">Total Sales</th>
                        <th className="px-2 py-2 font-medium">Avg Spend</th>
                        {catCols.map((c) => (
                          <th key={c.key} className="px-2 py-2 font-medium capitalize">{c.label}</th>
                        ))}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, idx) => {
                        const spc = r.total_covers > 0 ? r.total_sales / r.total_covers : 0;
                        const cellCls = "rounded-md border border-border px-2 py-1 text-sm w-20";
                        return (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={r.server_name}
                                onChange={(e) => updatePreviewRow(idx, "server_name", e.target.value)}
                                className="rounded-md border border-border px-2 py-1 text-sm w-32"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" value={r.total_covers}
                                onChange={(e) => updatePreviewRow(idx, "total_covers", e.target.value)}
                                className={cellCls} />
                            </td>
                            <td className="px-2 py-2">
                              <input type="number" value={r.total_sales}
                                onChange={(e) => updatePreviewRow(idx, "total_sales", e.target.value)}
                                className={cellCls} />
                            </td>
                            <td className="px-2 py-2 text-center text-muted-foreground">£{spc.toFixed(2)}</td>
                            {catCols.map((c) => {
                              const entry = r.categories?.[c.key];
                              const val = Number(entry?.sales ?? 0);
                              return (
                                <td key={c.key} className="px-2 py-2">
                                  <input
                                    type="number"
                                    value={val}
                                    onChange={(e) => updatePreviewCategory(idx, c.key, e.target.value)}
                                    className={cellCls}
                                  />
                                </td>
                              );
                            })}
                            <td className="px-2 py-2">
                              <button
                                onClick={() => removePreviewRow(idx)}
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="Remove row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {catCols.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No category columns detected in your image. Totals will be imported — you can still confirm.
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={confirmPreview}
                disabled={uploading || previewRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--brand-green)" }}
              >
                <Upload className="h-4 w-4" /> {uploading ? "Importing…" : "Confirm & Update Dashboard"}
              </button>
              <button
                onClick={() => { setPreviewRows(null); setUploadStatus(""); }}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              {previewConfidence < 0.7 && (
                <span className="text-xs text-destructive font-semibold">
                  Low OCR confidence — double-check every value before importing.
                </span>
              )}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            icon={Users}
            tone="var(--brand-green)"
            label="Total Covers"
            value={totals.covers.toLocaleString()}
            sub={`${members.length} server${members.length === 1 ? "" : "s"}`}
          />
          <Stat
            icon={PoundSterling}
            tone="var(--brand-green)"
            label="Avg Spend per Cover"
            value={`£${totals.spc.toFixed(2)}`}
            sub={`Total £${totals.sales.toFixed(0)}`}
          />
          <Stat
            icon={TrendingUp}
            tone={members.length ? performanceTone(stats.length, members.length) : "var(--brand-orange)"}
            label="Servers reporting"
            value={`${stats.length} / ${members.length}`}
          />
          <Stat
            icon={Eye}
            tone={members.length ? performanceTone(viewedCount, members.length) : "var(--brand-green)"}
            label="Viewed Stats"
            value={`${viewedCount} / ${members.length}`}
            sub={`${ackedCount} ack'd focus`}
          />
        </div>

        {/* Team table */}
        <div className="mt-6 rounded-2xl bg-white border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display text-lg font-bold">Team Performance</h2>
          </div>
          {members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Share your join code{" "}
              <span className="font-mono font-bold text-brand-green">{venue?.join_code}</span> so
              servers can join your team.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Server</th>
                    <th className="px-3 py-3 font-medium">SPC</th>
                    {cats.map((c) => (
                      <th key={c.label} className="px-3 py-3 font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium">Viewed</th>
                    <th className="px-3 py-3 font-medium">Ack'd</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const s = statByUser[m.id];
                    const t = targetByUser[m.id];
                    return (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-5 py-4 font-semibold">{m.full_name || "Unnamed"}</td>
                        <td className="px-3 text-center text-foreground/80">
                          {s?.spend_per_cover ? `£${Number(s.spend_per_cover).toFixed(0)}` : "—"}
                        </td>
                        {cats.map((c) => {
                          const actual = s ? Number(s[c.key] ?? 0) : 0;
                          const target = t ? Number(t[c.tKey]) : 0;
                          if (!s)
                            return (
                              <td key={c.label} className="px-3 text-center text-muted-foreground">
                                —
                              </td>
                            );
                          return (
                            <td key={c.label} className="px-3 text-center">
                              <Dot s={performanceColour(actual, target)} />
                            </td>
                          );
                        })}
                        <td
                          className={`px-3 text-center font-semibold ${views[m.id] ? "text-brand-green" : "text-muted-foreground"}`}
                        >
                          {views[m.id] ? "Yes" : "No"}
                        </td>
                        <td
                          className={`px-3 text-center font-semibold ${acks[m.id] ? "text-brand-green" : "text-muted-foreground"}`}
                        >
                          {acks[m.id] ? "Yes" : "No"}
                        </td>
                        <td className="px-3">
                          <Link
                            to="/manager/server/$id"
                            params={{ id: m.id }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <Link
            to="/manager/priorities"
            className="rounded-2xl bg-white border border-border p-5 hover:border-brand-green transition"
          >
            <div className="flex items-center gap-3">
              <Target className="h-6 w-6 text-brand-green" />
              <h3 className="font-display font-bold">Set this week's priorities</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick the menu items your team should push.
            </p>
          </Link>
          <Link
            to="/manager/menu"
            className="rounded-2xl bg-white border border-border p-5 hover:border-brand-green transition"
          >
            <div className="flex items-center gap-3">
              <Wine className="h-6 w-6 text-brand-orange" />
              <h3 className="font-display font-bold">Menu intelligence</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload your menu and get AI coaching insights.
            </p>
          </Link>
        </div>
      </div>
    </ManagerLayout>
  );
}
