import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { useRoleGate } from "@/lib/auth-gate";
import { Sparkles, Wand2, CheckCircle2, ClipboardList, Users, Target } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange, latestStatsWeek } from "@/lib/week";
import { toast } from "sonner";

// Phase 11 — Manager Coaching surfaces operational workflow status:
// what is sent to servers, what is approved but unsent, what still needs
// manager review. This is the manager-only "truth behind the game".
export const Route = createFileRoute("/manager/coaching")({ component: Page });

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
};

function Page() {
  useRoleGate("manager");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [insights, setInsights] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(toISODate(getMondayOfWeek()));
  const [oneToOneNotes, setOneToOneNotes] = useState("");

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      setVenueId(v);
      const visibleWeek = await latestStatsWeek(
        supabase.from("server_stats").select("week_start, created_at").eq("venue_id", v).order("created_at", { ascending: false }).order("week_start", { ascending: false }).limit(1),
        weekStart,
      );
      setWeekStart(visibleWeek);
      const { data: pr } = await supabase
        .from("weekly_priorities")
        .select("id,item_name,title,category,priority_flag,status,reason,expected_behaviour,expected_impact,expected_impact_basis")
        .eq("venue_id", v).eq("week_start", visibleWeek);
      setPriorities(((pr ?? []) as unknown) as Priority[]);
    })();
  }, [weekStart]);

  const generate = async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: { action: "coaching", venueId, payload: { weekStart } },
      });
      if (error) throw error;
      setInsights(data?.text || "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Coaching generation failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const byStatus = (s: Status) => priorities.filter((p) => p.status === s);
  const sent = byStatus("sent_to_servers");
  const approved = byStatus("approved");
  const pending = byStatus("ai_suggested");
  const rejected = byStatus("rejected");
  const archived = byStatus("archived");

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight inline-flex items-center gap-3">
          Coaching <Sparkles className="h-7 w-7 text-brand-orange" />
        </h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>

        {/* Workflow status summary */}
        <div className="mt-6 grid sm:grid-cols-5 gap-3">
          <Tile icon={<Users className="h-4 w-4" />} label="Sent to servers" count={sent.length} tone="green" />
          <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Approved (unsent)" count={approved.length} tone="green-soft" />
          <Tile icon={<ClipboardList className="h-4 w-4" />} label="Awaiting review" count={pending.length} tone="orange" />
          <Tile icon={<Target className="h-4 w-4" />} label="Rejected" count={rejected.length} tone="muted" />
          <Tile icon={<Target className="h-4 w-4" />} label="Archived" count={archived.length} tone="muted" />
        </div>

        {/* What's live with servers */}
        <Section title="What servers can see right now">
          {sent.length + approved.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No approved priorities yet. <Link to="/manager/priorities" className="text-brand-green font-semibold">Review priorities →</Link>
            </p>
          ) : (
            <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
              {[...sent, ...approved].map((p) => (
                <li key={p.id} className="rounded-xl border border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.title || p.item_name}</span>
                    <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5"
                      style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>
                      {p.status === "sent_to_servers" ? "live" : "approved"}
                    </span>
                  </div>
                  {p.reason && <div className="text-xs text-muted-foreground mt-1">{p.reason}</div>}
                  {p.expected_impact && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Expected impact <em>({p.expected_impact_basis})</em>: {p.expected_impact}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* What still needs approval */}
        {pending.length > 0 && (
          <Section title="Still needs your approval">
            <p className="mt-1 text-xs text-muted-foreground">AI suggestions never reach servers automatically.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {pending.map((p) => (
                <li key={p.id} className="rounded-xl border border-dashed border-border px-3 py-2">
                  <span className="font-semibold">{p.title || p.item_name}</span>
                  {p.reason && <span className="text-xs text-muted-foreground"> · {p.reason}</span>}
                </li>
              ))}
            </ul>
            <Link to="/manager/priorities" className="mt-3 inline-block text-sm font-semibold" style={{ color: "var(--brand-green)" }}>
              Review now →
            </Link>
          </Section>
        )}

        {/* Pre-shift briefing */}
        <Section title="Pre-shift briefing">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-muted-foreground">AI talking points draft for today's pre-shift. Numbers are <em>modelled</em>, not guaranteed revenue.</p>
            <button onClick={generate} disabled={loading} className="rounded-xl px-4 py-2 text-sm font-bold text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--brand-green)" }}>
              <Wand2 className="h-4 w-4" /> {loading ? "Generating…" : "Generate briefing"}
            </button>
          </div>
          {insights ? (
            <pre className="mt-4 whitespace-pre-wrap text-sm text-foreground/85 font-sans">{insights}</pre>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Click Generate to draft a briefing from this week's approved priorities and trends.</p>
          )}
        </Section>

        {/* One-to-one coaching notes */}
        <Section title="One-to-one coaching notes (private)">
          <p className="text-xs text-muted-foreground">Private notes for your follow-ups. Not visible to servers.</p>
          <textarea
            value={oneToOneNotes}
            onChange={(e) => setOneToOneNotes(e.target.value)}
            rows={6}
            placeholder={"Server: \nFocus area: \nNext check-in: "}
            className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm font-mono"
          />
        </Section>

        {/* Manager checklist */}
        <Section title="Manager checklist">
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>☐ Review AI suggestions before service</li>
            <li>☐ Approve or reject this week's priorities</li>
            <li>☐ Send approved priorities to the team</li>
            <li>☐ Confirm priorities at pre-shift briefing</li>
            <li>☐ Measure before/after on next stats upload</li>
          </ul>
        </Section>
      </div>
    </ManagerLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl bg-white border border-border p-5">
      <h2 className="font-display font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Tile({ icon, label, count, tone }: { icon: React.ReactNode; label: string; count: number; tone: "green" | "green-soft" | "orange" | "muted" }) {
  const palette: Record<string, { bg: string; fg: string; bd: string }> = {
    green:       { bg: "color-mix(in oklab, var(--brand-green) 14%, white)",  fg: "var(--brand-green)",       bd: "color-mix(in oklab, var(--brand-green) 40%, transparent)" },
    "green-soft":{ bg: "color-mix(in oklab, var(--brand-green) 6%, white)",   fg: "var(--brand-green)",       bd: "var(--border)" },
    orange:      { bg: "color-mix(in oklab, var(--brand-orange) 14%, white)", fg: "var(--brand-orange)",      bd: "color-mix(in oklab, var(--brand-orange) 40%, transparent)" },
    muted:       { bg: "var(--muted)",                                          fg: "var(--muted-foreground)", bd: "var(--border)" },
  };
  const p = palette[tone];
  return (
    <div className="rounded-2xl border p-3" style={{ background: p.bg, borderColor: p.bd }}>
      <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: p.fg }}>
        {icon} {label}
      </div>
      <div className="font-display text-2xl font-extrabold leading-none mt-1">{count}</div>
    </div>
  );
}
