import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { Target, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { getMondayOfWeek, toISODate, formatWeekRange } from "@/lib/week";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/priorities")({ component: Priorities });

type Item = { id: string; item_name: string; category: string | null; priority_flag: string };

function Priorities() {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [flag, setFlag] = useState("push");
  const weekStart = toISODate(getMondayOfWeek());

  const load = async (v: string) => {
    const { data } = await supabase.from("weekly_priorities").select("*").eq("venue_id", v).eq("week_start", weekStart).order("created_at", { ascending: true });
    setItems((data ?? []) as Item[]);
  };

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: vs } = await supabase.from("venues").select("id").eq("manager_id", u.user.id).limit(1);
      const v = vs?.[0]?.id;
      if (v) { setVenueId(v); await load(v); }
    })();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueId || !name.trim()) return;
    const { error } = await supabase.from("weekly_priorities").insert({
      venue_id: venueId, week_start: weekStart, item_name: name.trim(), category: category.trim() || null, priority_flag: flag,
    });
    if (error) { toast.error(error.message); return; }
    setName(""); setCategory("");
    await load(venueId);
    toast.success("Priority added");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("weekly_priorities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (venueId) await load(venueId);
  };

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
            <p className="mt-3 text-sm text-foreground/70 max-w-2xl">Choose menu items your team should push this week. Servers see these in their Coaching tab.</p>
          </div>
        </div>

        <form onSubmit={add} className="mt-6 rounded-2xl bg-white border border-border p-5 grid sm:grid-cols-12 gap-3">
          <input className="sm:col-span-5 rounded-xl border border-border px-3 py-2 text-sm" placeholder="Item name (e.g. Sancerre)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="sm:col-span-3 rounded-xl border border-border px-3 py-2 text-sm" placeholder="Category (Wine, Side, …)" value={category} onChange={(e) => setCategory(e.target.value)} />
          <select className="sm:col-span-2 rounded-xl border border-border px-3 py-2 text-sm" value={flag} onChange={(e) => setFlag(e.target.value)}>
            <option value="push">Push</option>
            <option value="standard">Standard</option>
            <option value="seasonal">Seasonal</option>
            <option value="hold">Do not promote</option>
          </select>
          <button className="sm:col-span-2 rounded-xl py-2 text-sm font-bold text-white inline-flex items-center justify-center gap-2" style={{ background: "var(--brand-green)" }}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>

        <div className="mt-5 rounded-2xl bg-white border border-border overflow-hidden">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No priorities yet for this week.</div>
          ) : items.map((it) => (
            <div key={it.id} className="grid grid-cols-12 items-center px-5 py-4 border-b border-border last:border-0">
              <div className="col-span-5 font-bold">{it.item_name}</div>
              <div className="col-span-3 text-sm text-muted-foreground">{it.category || "—"}</div>
              <div className="col-span-3">
                <span className="text-xs font-semibold px-3 py-1 rounded-md" style={{
                  background: it.priority_flag === "push" ? "color-mix(in oklab, var(--brand-orange) 18%, white)" : "var(--muted)",
                  color: it.priority_flag === "push" ? "var(--brand-orange)" : "var(--muted-foreground)",
                }}>{it.priority_flag}</span>
              </div>
              <div className="col-span-1 text-right">
                <button onClick={() => remove(it.id)} className="text-muted-foreground hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="mt-4 rounded-xl px-5 py-3 inline-flex items-center gap-2 text-sm font-medium"
            style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", color: "var(--brand-green)" }}>
            <CheckCircle2 className="h-4 w-4" /> Saved. Servers will see these in their Coaching tab.
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
