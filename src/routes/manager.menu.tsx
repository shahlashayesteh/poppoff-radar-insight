import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, Wand2, ChevronRight, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/menu")({ component: MenuIntel });

type ParsedItem = { name: string; category?: string; price?: string; pairing?: string; priority?: string };
type Menu = { id: string; menu_text: string; parsed_items: ParsedItem[] | null; uploaded_at: string };
type Pairing = { item: string; pair_with: string; why: string; priority?: string };

const MAX_MENUS = 10;

function MenuIntel() {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [pairingLoading, setPairingLoading] = useState(false);

  const loadMenus = async (v: string) => {
    const { data } = await supabase.from("venue_menu").select("id, menu_text, parsed_items, uploaded_at").eq("venue_id", v).order("uploaded_at", { ascending: false }).limit(MAX_MENUS);
    setMenus(((data ?? []) as unknown) as Menu[]);
  };

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: vs } = await supabase.from("venues").select("id").eq("manager_id", u.user.id).limit(1);
      const v = vs?.[0]?.id;
      if (!v) return;
      setVenueId(v);
      await loadMenus(v);
    })();
  }, []);

  const addMenu = async () => {
    if (!venueId || !text.trim()) { toast.error("Paste menu text first"); return; }
    if (menus.length >= MAX_MENUS) { toast.error(`You can store up to ${MAX_MENUS} menus. Delete one first.`); return; }
    setLoading(true);
    try {
      const body = label.trim() ? `# ${label.trim()}\n\n${text}` : text;
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: { action: "parse_menu", venueId, payload: { menu_text: body } },
      });
      if (error) throw error;
      const items: ParsedItem[] = data?.items ?? [];
      toast.success(`Parsed ${items.length} item${items.length === 1 ? "" : "s"}`);
      setText(""); setLabel("");
      await loadMenus(venueId);
    } catch (e: any) {
      toast.error(e.message || "AI parse failed");
    } finally {
      setLoading(false);
    }
  };

  const removeMenu = async (id: string) => {
    const { error } = await supabase.from("venue_menu").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (venueId) await loadMenus(venueId);
  };

  const generatePairings = async () => {
    if (!venueId) return;
    if (menus.length === 0) { toast.error("Upload at least one menu first"); return; }
    setPairingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assist", {
        body: { action: "generate_pairings", venueId },
      });
      if (error) throw error;
      setPairings(data?.pairings ?? []);
      toast.success("Pairings ready");
    } catch (e: any) {
      toast.error(e.message || "Pairing failed");
    } finally {
      setPairingLoading(false);
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
            <p className="mt-2 text-sm text-foreground/70 max-w-xl">Upload up to {MAX_MENUS} menus (food, wine, cocktails, seasonal). AI extracts items and recommends cross-menu pairings.</p>
          </div>
          <div className="rounded-2xl border border-border p-4 flex items-start gap-3 max-w-sm bg-white">
            <Brain className="h-6 w-6 text-brand-green shrink-0" />
            <div className="text-sm text-muted-foreground">{menus.length} / {MAX_MENUS} menus uploaded</div>
          </div>
        </div>

        <div className="mt-6 grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold mb-3">Add a menu</h3>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Wine list, Spring menu)" className="w-full rounded-xl border border-border px-3 py-2 text-sm mb-2" />
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm font-mono"
              placeholder={"Starters\nBurrata £10\nCalamari £12\n\nMains\nGrilled Salmon £24\n..."}
            />
            <button onClick={addMenu} disabled={loading || !venueId || menus.length >= MAX_MENUS} className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "var(--brand-green)" }}>
              <Plus className="h-4 w-4" /> {loading ? "Analyzing…" : "Add & analyze"}
            </button>
          </div>

          <div className="lg:col-span-7 rounded-2xl bg-white border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold">Your menus</h3>
              <button onClick={generatePairings} disabled={pairingLoading || menus.length === 0} className="rounded-xl px-3 py-1.5 text-xs font-bold text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--brand-orange)" }}>
                <Wand2 className="h-3.5 w-3.5" /> {pairingLoading ? "Pairing…" : "Generate pairings"}
              </button>
            </div>
            {menus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No menus yet. Add your first one on the left.</p>
            ) : (
              <ul className="space-y-2">
                {menus.map((m) => {
                  const firstLine = (m.menu_text || "").split("\n").find((l) => l.trim()) || "Menu";
                  const itemCount = Array.isArray(m.parsed_items) ? m.parsed_items.length : 0;
                  return (
                    <li key={m.id} className="rounded-xl border border-border px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{firstLine.replace(/^#\s*/, "")}</div>
                          <div className="text-xs text-muted-foreground">{itemCount} items · {new Date(m.uploaded_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <button onClick={() => removeMenu(m.id)} className="text-muted-foreground hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {pairings.length > 0 && (
          <div className="mt-6 rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold mb-3">AI pairings across your menus</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="text-left"><th className="pb-2">Item</th><th>Pair with</th><th>Why</th><th>Priority</th></tr></thead>
                <tbody>
                  {pairings.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-3 font-semibold">{p.item}</td>
                      <td className="py-3">{p.pair_with}</td>
                      <td className="py-3 text-foreground/75">{p.why}</td>
                      <td className="py-3"><span className="text-xs font-semibold px-2 py-1 rounded" style={{
                        background: p.priority === "High" ? "color-mix(in oklab, var(--brand-orange) 18%, white)" : "var(--muted)",
                        color: p.priority === "High" ? "var(--brand-orange)" : "var(--muted-foreground)",
                      }}>{p.priority || "Medium"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
          <div className="text-sm">Weekly priorities are auto-generated from your menus when you upload stats.</div>
          <Link to="/manager/priorities" className="rounded-lg px-4 py-2 text-sm font-bold inline-flex items-center gap-2"
            style={{ background: "var(--brand-green)", color: "white" }}>
            View priorities <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </ManagerLayout>
  );
}
