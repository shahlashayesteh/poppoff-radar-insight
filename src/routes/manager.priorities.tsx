import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { useRoleGate } from "@/lib/auth-gate";
import { Target, Plus, Trash2, CheckCircle2, Send, Archive, Ban, Sparkles } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, latestStatsWeek } from "@/lib/week";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { PaidManagerGate } from "@/components/manager/PaidManagerGate";
import { useVerifyPaidManagerAccess } from "@/hooks/use-verify-paid-manager-access";
import { listWeeklyPriorities } from "@/lib/manager-data.functions";
import { getRecommendationTrace } from "@/lib/manager-trace.functions";
import { ManagerTraceDrawer, type TracePayload } from "@/components/manager/manager-trace-drawer";
import { useActiveVenue } from "@/hooks/use-active-venue";
import { NoVenueState } from "@/components/manager/no-venue-state";
import { EvidenceBasis } from "@/components/reliability";
import { buildRecommendationEvidence, recommendationConfidence } from "@/lib/provenance";


export const Route = createFileRoute("/manager/priorities")({
  component: () => (
    <PaidManagerGate feature="weekly priorities">
      <Priorities />
    </PaidManagerGate>
  ),
});

type Status = "ai_suggested" | "approved" | "sent_to_servers" | "rejected" | "archived";

type Priority = {
  id: string;
  item_name: string;
  title: string | null;
  category: string | null;
  priority_flag: string;
  status: Status;
  reason: string | null;
  expected_behaviour: string | null;
  expected_impact: string | null;
  expected_impact_basis: string;
  server_group: string | null;
  start_date: string | null;
  end_date: string | null;
  approved_at: string | null;
  sent_to_servers_at: string | null;
  rejected_reason: string | null;
  archived_at: string | null;
};

const STATUS_TABS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai_suggested", label: "AI suggested" },
  { key: "approved", label: "Approved" },
  { key: "sent_to_servers", label: "Sent to servers" },
  { key: "rejected", label: "Rejected" },
  { key: "archived", label: "Archived" },
];

const STATUS_TONE: Record<Status, { bg: string; fg: string; label: string }> = {
  ai_suggested:     { bg: "color-mix(in oklab, var(--brand-orange) 16%, white)", fg: "var(--brand-orange)",      label: "AI suggested" },
  approved:         { bg: "color-mix(in oklab, var(--brand-green) 16%, white)",  fg: "var(--brand-green)",       label: "Approved" },
  sent_to_servers:  { bg: "color-mix(in oklab, var(--brand-green) 28%, white)",  fg: "var(--brand-green)",       label: "Sent to servers" },
  rejected:         { bg: "var(--muted)",                                          fg: "var(--muted-foreground)", label: "Rejected" },
  archived:         { bg: "var(--muted)",                                          fg: "var(--muted-foreground)", label: "Archived" },
};

async function logAudit(
  venueId: string,
  entityId: string,
  fromStatus: string | null,
  toStatus: string,
  note?: string,
) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("menu_intelligence_audit_events").insert({
    venue_id: venueId,
    entity_type: "weekly_priority",
    entity_id: entityId,
    actor_user_id: u.user?.id ?? null,
    from_status: fromStatus,
    to_status: toStatus,
    note: note ?? null,
  });
}

function Priorities() {
  useRoleGate("manager");
  useVerifyPaidManagerAccess();
  const active = useActiveVenue();
  const fetchPriorities = useServerFn(listWeeklyPriorities);

  const fetchRecTrace = useServerFn(getRecommendationTrace);
  const [recTrace, setRecTrace] = useState<TracePayload>({ kind: "loading" });

  const [venueId, setVenueId] = useState<string | null>(null);
  const [items, setItems] = useState<Priority[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [expectedBehaviour, setExpectedBehaviour] = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");
  const [flag, setFlag] = useState("push");
  const [weekStart, setWeekStart] = useState(toISODate(getMondayOfWeek()));
  const [pendingDelete, setPendingDelete] = useState<Priority | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<Status | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (v: string, ws = weekStart) => {
    try {
      const res = await fetchPriorities({ data: { venueId: v, weekStart: ws } });
      // Sort ascending by created_at (server returns desc) to preserve UX.
      const rows = ((res?.rows ?? []) as unknown as Priority[]).slice().reverse();
      setItems(rows);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (v) {
        setVenueId(v);
        const visibleWeek = await latestStatsWeek(
          supabase.from("server_stats").select("week_start, created_at").eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
          weekStart,
        );
        setWeekStart(visibleWeek);
        await load(v, visibleWeek);
      }
    })();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueId || !name.trim()) return;
    // Manager-created priorities are immediately sent to servers — preserves
    // existing UX. AI-sourced rows can land as ai_suggested via the menu page.
    const { data: u } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    // Phase 18A — persist evidence at creation. Manager-authored priorities
    // are "manager_judgement" — we record that explicitly rather than letting
    // them masquerade as POS-derived intelligence.
    const evidence = buildRecommendationEvidence({
      based_on: ["manager_judgement"],
      explanation_basis: "Manager-authored priority (not derived from POS data).",
    });
    const { data: inserted, error } = await supabase.from("weekly_priorities").insert({
      venue_id: venueId,
      week_start: weekStart,
      item_name: name.trim(),
      category: category.trim() || null,
      priority_flag: flag,
      title: name.trim(),
      reason: reason.trim() || null,
      expected_behaviour: expectedBehaviour.trim() || null,
      expected_impact: expectedImpact.trim() || null,
      expected_impact_basis: "modelled",
      status: "sent_to_servers",
      created_by: u.user?.id ?? null,
      approved_by: u.user?.id ?? null,
      approved_at: now,
      sent_to_servers_at: now,
      evidence: evidence as never,
      recommendation_confidence: recommendationConfidence(evidence),
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    if (inserted?.id) await logAudit(venueId, inserted.id, null, "sent_to_servers", "Manager-created priority");
    setName(""); setCategory(""); setReason(""); setExpectedBehaviour(""); setExpectedImpact("");
    await load(venueId);
    toast.success("Priority added & sent to servers");
  };

  const transition = async (it: Priority, next: Status, extra: Partial<Priority> = {}, note?: string) => {
    if (!venueId) return;
    setBusy(it.id);
    const now = new Date().toISOString();
    const { data: u } = await supabase.auth.getUser();
    const patch: Record<string, unknown> = { status: next, ...extra };
    if (next === "approved") { patch.approved_by = u.user?.id ?? null; patch.approved_at = now; }
    if (next === "sent_to_servers") {
      patch.sent_to_servers_at = now;
      if (!it.approved_at) { patch.approved_by = u.user?.id ?? null; patch.approved_at = now; }
    }
    if (next === "rejected") { patch.rejected_at = now; }
    if (next === "archived") { patch.archived_at = now; }
    const { error } = await supabase.from("weekly_priorities").update(patch as never).eq("id", it.id);
    if (error) { toast.error(error.message); setBusy(null); return; }
    await logAudit(venueId, it.id, it.status, next, note);
    await load(venueId);
    setBusy(null);
    toast.success(`Priority ${STATUS_TONE[next].label.toLowerCase()}`);
  };

  const confirmRemove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("weekly_priorities").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    setPendingDelete(null);
    if (venueId) await load(venueId);
    toast.success("Priority deleted");
  };

  const counts = (() => {
    const out: Record<Status | "all", number> = { all: items.length, ai_suggested: 0, approved: 0, sent_to_servers: 0, rejected: 0, archived: 0 };
    for (const i of items) out[i.status] = (out[i.status] ?? 0) + 1;
    return out;
  })();
  const visible = activeTab === "all" ? items : items.filter((i) => i.status === activeTab);

  if (active.status !== "ready") {
    return (
      <ManagerLayout>
        <div className="px-8 py-7">
          <NoVenueState status={active.status} venues={active.venues} />
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        <div className="text-sm flex items-center gap-2">
          <Link to="/manager" className="text-brand-green font-medium">Manager Dashboard</Link>
          <span className="text-muted-foreground">›</span>
          <span className="text-foreground font-medium">Weekly Priorities</span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight inline-flex items-center gap-3">
              Weekly Win Priorities <Target className="h-7 w-7 text-brand-orange" />
            </h1>
            <div className="mt-2 text-sm text-muted-foreground">{formatWeekRange(weekStart)}</div>
            <p className="mt-3 text-sm text-foreground/70 max-w-2xl">
              Approve, reject or archive AI suggestions before sending priorities to your team.
              Only <strong>approved</strong> or <strong>sent-to-servers</strong> priorities reach the server coaching page.
            </p>
          </div>
        </div>

        <form onSubmit={add} className="mt-6 rounded-2xl bg-white border border-border p-5 space-y-3">
          <div className="grid sm:grid-cols-12 gap-3">
            <input className="sm:col-span-5 rounded-xl border border-border px-3 py-2 text-sm" placeholder="Item name (e.g. Sancerre)" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="sm:col-span-3 rounded-xl border border-border px-3 py-2 text-sm" placeholder="Category (Wine, Side, …)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <select className="sm:col-span-2 rounded-xl border border-border px-3 py-2 text-sm" value={flag} onChange={(e) => setFlag(e.target.value)}>
              <option value="push">Push</option>
              <option value="standard">Standard</option>
              <option value="seasonal">Seasonal</option>
              <option value="hold">Do not promote</option>
            </select>
            <button className="sm:col-span-2 rounded-xl py-2 text-sm font-bold text-white inline-flex items-center justify-center gap-2" style={{ background: "var(--brand-green)" }}>
              <Plus className="h-4 w-4" /> Add & send
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <input className="rounded-xl border border-border px-3 py-2 text-sm" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <input className="rounded-xl border border-border px-3 py-2 text-sm" placeholder="Expected server behaviour" value={expectedBehaviour} onChange={(e) => setExpectedBehaviour(e.target.value)} />
            <input className="rounded-xl border border-border px-3 py-2 text-sm" placeholder="Expected impact (modelled)" value={expectedImpact} onChange={(e) => setExpectedImpact(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Expected impact is <em>modelled</em> — directional only, not guaranteed revenue.
          </p>
        </form>

        {/* Status tabs */}
        <div className="mt-5 flex gap-2 overflow-x-auto -mx-1 px-1">
          {STATUS_TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap border"
                style={{
                  background: active ? "var(--brand-green)" : "white",
                  color: active ? "white" : "var(--foreground)",
                  borderColor: active ? "var(--brand-green)" : "var(--border)",
                }}>
                {t.label} <span className="opacity-70">({counts[t.key] ?? 0})</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl bg-white border border-border overflow-hidden">
          {visible.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No priorities in this view.</div>
          ) : visible.map((it) => {
            const tone = STATUS_TONE[it.status];
            return (
              <div key={it.id} className="px-5 py-4 border-b border-border last:border-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold">{it.title || it.item_name}</div>
                      <span className="text-[10px] font-bold rounded-md px-2 py-0.5" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                      <span className="text-[10px] font-semibold rounded-md px-2 py-0.5 bg-muted text-muted-foreground">{it.priority_flag}</span>
                      {it.category && <span className="text-[11px] text-muted-foreground">· {it.category}</span>}
                    </div>
                    {it.reason && <div className="text-xs text-foreground/70 mt-1">{it.reason}</div>}
                    {it.expected_behaviour && <div className="text-[11px] text-muted-foreground mt-1">Server behaviour: {it.expected_behaviour}</div>}
                    {it.expected_impact && <div className="text-[11px] text-muted-foreground mt-0.5">
                      Expected impact <em>({it.expected_impact_basis})</em>: {it.expected_impact}
                    </div>}
                    {it.rejected_reason && <div className="text-[11px] text-muted-foreground mt-0.5">Rejected: {it.rejected_reason}</div>}
                    {it.status === "ai_suggested" && (
                      <EvidenceBasis
                        className="mt-2 max-w-xl"
                        fields={[
                          "pos_item_sold",
                          "pos_check_total",
                          "pos_menu_category",
                          "sevenrooms_section",
                        ]}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ManagerTraceDrawer
                      label="Evidence"
                      title={`Priority · ${it.title || it.item_name}`}
                      payload={recTrace}
                      onOpen={async () => {
                        if (!venueId) return;
                        setRecTrace({ kind: "loading" });
                        try {
                          const res = await fetchRecTrace({ data: { venueId, recordType: "weekly_priority", recordId: it.id } });
                          if (!res.found) setRecTrace({ kind: "empty", message: "No evidence recorded for this priority." });
                          else setRecTrace({ kind: "recommendation", recordType: "weekly_priority", evidence: res.evidence, created_at: res.created_at });
                        } catch (e: any) {
                          setRecTrace({ kind: "error", message: e?.message ?? "Failed to load evidence" });
                        }
                      }}
                    />
                    {it.status === "ai_suggested" && (
                      <>
                        <button disabled={busy === it.id} onClick={() => transition(it, "approved")} className="text-xs font-semibold rounded-lg px-3 py-1.5 text-white" style={{ background: "var(--brand-green)" }}>
                          <CheckCircle2 className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />Approve
                        </button>
                        <button disabled={busy === it.id} onClick={() => transition(it, "rejected", {}, "Manager rejected AI suggestion")} className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-border">
                          <Ban className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />Reject
                        </button>
                      </>
                    )}
                    {it.status === "approved" && (
                      <button disabled={busy === it.id} onClick={() => transition(it, "sent_to_servers")} className="text-xs font-semibold rounded-lg px-3 py-1.5 text-white" style={{ background: "var(--brand-green)" }}>
                        <Send className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />Send to servers
                      </button>
                    )}
                    {(it.status === "approved" || it.status === "sent_to_servers") && (
                      <button disabled={busy === it.id} onClick={() => transition(it, "archived")} className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-border">
                        <Archive className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />Archive
                      </button>
                    )}
                    <button onClick={() => setPendingDelete(it)} className="text-muted-foreground hover:text-foreground" aria-label="Delete priority">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl px-5 py-3 inline-flex items-center gap-2 text-sm font-medium"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", color: "var(--brand-green)" }}>
          <Sparkles className="h-4 w-4" /> Server coaching only shows approved or sent-to-servers priorities — rejected and archived stay manager-only.
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete ? `Delete "${pendingDelete.item_name}"?` : "Delete priority?"}
        description="Delete this weekly priority? Servers will no longer see it. This cannot be undone."
        loading={deleting}
        onConfirm={confirmRemove}
      />
    </ManagerLayout>
  );
}
