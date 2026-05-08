import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Wand2 } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange } from "@/lib/week";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/coaching")({ component: Page });

function Page() {
  const [priorities, setPriorities] = useState<any[]>([]);
  const [insights, setInsights] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any[]>([]);
  const weekStart = toISODate(getMondayOfWeek());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: vs } = await supabase.from("venues").select("id").eq("manager_id", u.user.id).limit(1);
      const v = vs?.[0]?.id;
      if (!v) return;
      const { data: pr } = await supabase.from("weekly_priorities").select("*").eq("venue_id", v).eq("week_start", weekStart);
      setPriorities(pr ?? []);
      const { data: st } = await supabase.from("server_stats").select("*").eq("venue_id", v).eq("week_start", weekStart);
      setStats(st ?? []);
    })();
  }, [weekStart]);

  const generate = async () => {
    setLoading(true);
    try {
      const summary = stats.map((s) => `cover_spend=£${Number(s.spend_per_cover ?? 0).toFixed(0)}, wine=${Number(s.wine_conversion ?? 0).toFixed(0)}%, dessert=${Number(s.dessert_conversion ?? 0).toFixed(0)}%, cocktail=${Number(s.cocktail_conversion ?? 0).toFixed(0)}%`).join("\n");
      const prItems = priorities.map((p) => `${p.item_name} (${p.priority_flag})`).join(", ");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a restaurant coaching expert. Give 3-5 short, actionable coaching talking points for a manager's pre-shift huddle. Use a warm, direct tone." },
            { role: "user", content: `Week priorities: ${prItems || "none set"}.\nServer stats:\n${summary || "no stats yet"}` },
          ],
        }),
      });
      const json = await res.json();
      setInsights(json.choices?.[0]?.message?.content || "");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ManagerLayout>
      <div className="px-8 py-8 max-w-5xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight inline-flex items-center gap-3">
          Coaching <Sparkles className="h-7 w-7 text-brand-orange" />
        </h1>
        <div className="mt-1 text-xs text-muted-foreground">{formatWeekRange(weekStart)}</div>

        <div className="mt-6 rounded-2xl bg-white border border-border p-5">
          <h2 className="font-display font-bold">This week's priorities</h2>
          {priorities.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None set yet. <Link to="/manager/priorities" className="text-brand-green font-semibold">Add some →</Link></p>
          ) : (
            <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
              {priorities.map((p) => (
                <li key={p.id} className="rounded-xl border border-border px-3 py-2"><span className="font-semibold">{p.item_name}</span> <span className="text-xs text-muted-foreground">· {p.priority_flag}</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 rounded-2xl bg-white border border-border p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display font-bold">AI talking points</h2>
            <button onClick={generate} disabled={loading} className="rounded-xl px-4 py-2 text-sm font-bold text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--brand-green)" }}>
              <Wand2 className="h-4 w-4" /> {loading ? "Generating…" : "Generate"}
            </button>
          </div>
          {insights ? (
            <pre className="mt-4 whitespace-pre-wrap text-sm text-foreground/85 font-sans">{insights}</pre>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Click Generate to get coaching talking points based on your team's data and priorities.</p>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}
