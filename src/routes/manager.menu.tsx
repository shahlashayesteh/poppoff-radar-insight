import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, Wand2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/menu")({ component: MenuIntel });

type ParsedItem = { name: string; category?: string; price?: string; pairing?: string; priority?: string };

function MenuIntel() {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: vs } = await supabase.from("venues").select("id").eq("manager_id", u.user.id).limit(1);
      const v = vs?.[0]?.id;
      if (!v) return;
      setVenueId(v);
      const { data: m } = await supabase.from("venue_menu").select("*").eq("venue_id", v).order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
      if (m) {
        setText(m.menu_text || "");
        setParsed((m.parsed_items as ParsedItem[]) || []);
      }
    })();
  }, []);

  const analyze = async () => {
    if (!venueId || !text.trim()) { toast.error("Paste your menu first"); return; }
    setLoading(true);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Extract menu items from the user's menu text. Respond with strict JSON: an array of items with fields name (string), category (string), price (string with currency), pairing (string suggesting a wine/drink pairing), priority (one of: 'High Priority' | 'Standard'). Keep it under 30 items." },
            { role: "user", content: text },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || "{}";
      let items: ParsedItem[] = [];
      try {
        const obj = JSON.parse(content);
        items = Array.isArray(obj) ? obj : (obj.items || obj.menu || []);
      } catch { items = []; }
      await supabase.from("venue_menu").insert({ venue_id: venueId, menu_text: text, parsed_items: items as unknown as never });
      setParsed(items);
      toast.success(`Parsed ${items.length} items`);
    } catch (e: any) {
      toast.error(e.message || "Failed to analyze menu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight inline-flex items-center gap-3">
              Menu Intelligence <Sparkles className="h-7 w-7 text-brand-orange" />
            </h1>
            <p className="mt-2 text-sm text-foreground/70 max-w-xl">Paste your menu, our AI extracts items, categories, and pairing recommendations.</p>
          </div>
          <div className="rounded-2xl border border-border p-4 flex items-start gap-3 max-w-sm bg-white">
            <Brain className="h-6 w-6 text-brand-green shrink-0" />
            <div className="text-sm text-muted-foreground">AI-powered menu analysis tailored to your venue.</div>
          </div>
        </div>

        <div className="mt-6 grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold mb-3">Paste your menu</h3>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm font-mono"
              placeholder={"Starters\nBurrata £10\nCalamari £12\n\nMains\nGrilled Salmon £24\n..."}
            />
            <button onClick={analyze} disabled={loading || !venueId} className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "var(--brand-green)" }}>
              <Wand2 className="h-4 w-4" /> {loading ? "Analyzing…" : "Analyze with AI"}
            </button>
          </div>

          <div className="lg:col-span-7 rounded-2xl bg-white border border-border p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold">Parsed items</h3>
              {parsed.length > 0 && (
                <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>
                  {parsed.length} items
                </span>
              )}
            </div>
            {parsed.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No items yet. Paste a menu and click Analyze.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-left"><th className="pb-3">Item</th><th>Category</th><th>Price</th><th>Pairing</th><th>Priority</th></tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-3 font-semibold">{p.name}</td>
                        <td className="py-3">{p.category || "—"}</td>
                        <td className="py-3">{p.price || "—"}</td>
                        <td className="py-3">{p.pairing || "—"}</td>
                        <td className="py-3">
                          <span className="text-xs font-semibold px-2 py-1 rounded" style={{
                            background: p.priority === "High Priority" ? "color-mix(in oklab, var(--brand-orange) 18%, white)" : "var(--muted)",
                            color: p.priority === "High Priority" ? "var(--brand-orange)" : "var(--muted-foreground)",
                          }}>{p.priority || "Standard"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
          <div className="text-sm">Pick what to push this week to drive coaching focus.</div>
          <Link to="/manager/priorities" className="rounded-lg px-4 py-2 text-sm font-bold inline-flex items-center gap-2"
            style={{ background: "var(--brand-green)", color: "white" }}>
            Set Weekly Priorities <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </ManagerLayout>
  );
}
