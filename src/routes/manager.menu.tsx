import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ManagerLayout } from "@/components/manager-layout";
import { supabase } from "@/integrations/supabase/client";
import { getManagerVenue } from "@/lib/manager-venue";
import { useRoleGate } from "@/lib/auth-gate";
import { Brain, Sparkles, Wand2, ChevronRight, Plus, Trash2, FileText, Upload } from "lucide-react";
import { getMondayOfWeek, toISODate } from "@/lib/week";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

export const Route = createFileRoute("/manager/menu")({ component: MenuIntel });

type ParsedItem = { name: string; category?: string; price?: string; pairing?: string; priority?: string };
type Menu = { id: string; menu_text: string; parsed_items: ParsedItem[] | null; uploaded_at: string };
type Pairing = { item: string; pair_with: string; why: string; priority?: string; category?: string };

const MAX_MENUS = 10;

function MenuIntel() {
  useRoleGate("manager");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingProgress, setPairingProgress] = useState<{ done: number; total: number } | null>(null);
  const [pairingSearch, setPairingSearch] = useState("");
  const menuFilesRef = useRef<HTMLInputElement>(null);
  const [pendingMenu, setPendingMenu] = useState<Menu | null>(null);
  const [deletingMenu, setDeletingMenu] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const loadMenus = async (v: string) => {
    const { data } = await supabase.from("venue_menu").select("id, menu_text, parsed_items, uploaded_at").eq("venue_id", v).order("uploaded_at", { ascending: false }).limit(MAX_MENUS);
    setMenus(((data ?? []) as unknown) as Menu[]);
  };

  const loadPairings = async (v: string) => {
    const { data } = await supabase.from("venue_pairings").select("item, pair_with, why, priority, category, position").eq("venue_id", v).order("position", { ascending: true });
    setPairings(((data ?? []) as unknown) as Pairing[]);
  };

  // After a menu/pairing change, ask the AI for fresh "push this week" priorities
  // for the LATEST uploaded stats week (not the calendar week) so the AI works
  // from real data. If no stats have been uploaded yet, skip — never seed.
  const regeneratePriorities = async (v: string) => {
    try {
      const { data: latest } = await supabase
        .from("server_stats")
        .select("week_start")
        .eq("venue_id", v)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      const weekStart = (latest as any)?.week_start;
      if (!weekStart) return;
      await supabase.functions.invoke("ai-assist", {
        body: { action: "generate_priorities", venueId: v, payload: { weekStart } },
      });
    } catch (err) {
      console.error("regeneratePriorities failed", err);
    }
  };

  useEffect(() => {
    (async () => {
      const venue = await getManagerVenue();
      const v = venue?.id;
      if (!v) return;
      setVenueId(v);
      await Promise.all([loadMenus(v), loadPairings(v)]);
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
      await supabase.from("weekly_priorities").delete().eq("venue_id", venueId);
      await loadMenus(venueId);
      void regeneratePriorities(venueId);
    } catch (e: any) {
      toast.error(e.message || "AI parse failed");
    } finally {
      setLoading(false);
    }
  };

  const fileToDataUrl = (file: File) => new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });

  const extractPdfText = async (file: File): Promise<{ text: string; images: string[] }> => {
    const pdfjs: any = await import("pdfjs-dist");
    // @ts-ignore
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let text = "";
    const images: string[] = [];
    const maxPages = Math.min(doc.numPages, 8);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const pageText = tc.items.map((it: any) => it.str).join(" ");
      text += pageText + "\n";
      // If page has very little text, render it to image for OCR via vision model
      if (pageText.trim().length < 40) {
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        images.push(canvas.toDataURL("image/jpeg", 0.7));
      }
    }
    return { text: text.trim(), images };
  };

  const uploadMenuFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!venueId || files.length === 0) return;
    const slots = MAX_MENUS - menus.length;
    if (slots <= 0) { toast.error(`You can store up to ${MAX_MENUS} menus. Delete one first.`); return; }
    const selected = files.slice(0, slots);
    if (files.length > slots) toast.warning(`Only ${slots} menu${slots === 1 ? "" : "s"} can be added right now.`);
    setLoading(true);
    try {
      let added = 0;
      for (const file of selected) {
        const ext = file.name.toLowerCase().split(".").pop() || "";
        const isImage = file.type.startsWith("image/");
        const isPdf = file.type === "application/pdf" || ext === "pdf";
        const label = `# ${file.name.replace(/\.[^.]+$/, "") || "Uploaded menu"}\n\n`;
        let menuText = "";
        let images: string[] = [];
        if (isImage) {
          images = [await fileToDataUrl(file)];
          menuText = label;
        } else if (isPdf) {
          toast.info(`Reading ${file.name}…`);
          const out = await extractPdfText(file);
          menuText = label + out.text;
          images = out.images;
        } else {
          const raw = await file.text();
          menuText = (label + raw).slice(0, 20000);
        }
        if (!images.length && menuText.trim().length < 8) continue;
        const { error } = await supabase.functions.invoke("ai-assist", {
          body: { action: "parse_menu", venueId, payload: { menu_text: menuText.slice(0, 20000), images } },
        });
        if (error) throw error;
        added += 1;
      }
      toast.success(`Menu saved · coaching refreshed for your team (${added})`);
      await supabase.from("weekly_priorities").delete().eq("venue_id", venueId);
      await loadMenus(venueId);
      void regeneratePriorities(venueId);
    } catch (e: any) {
      toast.error(e.message || "Menu upload failed");
    } finally {
      setLoading(false);
      if (menuFilesRef.current) menuFilesRef.current.value = "";
    }
  };

  const confirmRemoveMenu = async () => {
    if (!pendingMenu) return;
    setDeletingMenu(true);
    const { error } = await supabase.from("venue_menu").delete().eq("id", pendingMenu.id);
    setDeletingMenu(false);
    if (error) { toast.error(error.message); return; }
    setPendingMenu(null);
    if (venueId) {
      await loadMenus(venueId);
      // Clear stale per-server coaching + priorities that referenced the deleted menu
      await supabase.from("weekly_priorities").delete().eq("venue_id", venueId);
      await supabase.functions.invoke("ai-assist", { body: { action: "invalidate_coaching", venueId } });
      void regeneratePriorities(venueId);
    }
    toast.success("Menu deleted · coaching refreshed");
  };

  const onGeneratePairingsClick = () => {
    if (!venueId) return;
    if (menus.length === 0) { toast.error("Upload at least one menu first"); return; }
    if (pairings.length > 0) { setConfirmRegen(true); return; }
    void generatePairings();
  };

  const generatePairings = async () => {
    if (!venueId) return;
    if (menus.length === 0) { toast.error("Upload at least one menu first"); return; }
    setConfirmRegen(false);
    setPairingLoading(true);
    setPairingProgress({ done: 0, total: 0 });
    try {
      // 1. Get list of food items
      const listRes = await supabase.functions.invoke("ai-assist", {
        body: { action: "list_food_items", venueId },
      });
      if (listRes.error) throw listRes.error;
      const foodItems: string[] = listRes.data?.items ?? [];
      if (foodItems.length === 0) { toast.error("No food items found in your menus"); return; }

      // 2. Clear old pairings, then chunk
      await supabase.from("venue_pairings").delete().eq("venue_id", venueId);
      setPairings([]);

      const CHUNK = 6;
      const chunks: string[][] = [];
      for (let i = 0; i < foodItems.length; i += CHUNK) chunks.push(foodItems.slice(i, i + CHUNK));
      setPairingProgress({ done: 0, total: foodItems.length });

      let collected: Pairing[] = [];
      let failures = 0;
      for (const chunk of chunks) {
        try {
          const r = await supabase.functions.invoke("ai-assist", {
            body: { action: "pair_chunk", venueId, payload: { items: chunk } },
          });
          if (r.error) throw r.error;
          const got: Pairing[] = r.data?.pairings ?? [];
          collected = collected.concat(got);
          setPairings([...collected]);
        } catch (err) {
          failures += 1;
          console.error("chunk failed", err);
        }
        setPairingProgress((p) => p ? { ...p, done: Math.min(p.total, p.done + chunk.length) } : p);
      }

      if (failures > 0) toast.warning(`${chunks.length - failures}/${chunks.length} batches succeeded`);
      else toast.success(`Pairings ready · sent to your team (${collected.length} suggestions)`);
      // Wipe stale per-server coaching + priorities so every server regenerates against the new pairings
      await supabase.from("weekly_priorities").delete().eq("venue_id", venueId);
      await supabase.functions.invoke("ai-assist", { body: { action: "invalidate_coaching", venueId } });
      await loadPairings(venueId);
      void regeneratePriorities(venueId);
    } catch (e: any) {
      toast.error(e.message || "Pairing failed");
    } finally {
      setPairingLoading(false);
      setPairingProgress(null);
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
            <label
              className={`mb-3 relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-center ${loading || !venueId || menus.length >= MAX_MENUS ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                ref={menuFilesRef}
                type="file"
                multiple
                accept=".txt,.csv,.md,.menu,.pdf,.png,.jpg,.jpeg,.webp,.heic,text/plain,text/csv,text/markdown,application/pdf,image/*"
                onChange={uploadMenuFiles}
                disabled={loading || !venueId || menus.length >= MAX_MENUS}
                aria-label="Upload menu files"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <Upload className="h-5 w-5 text-brand-green" />
              <span className="text-sm font-bold">Upload menu files</span>
              <span className="text-xs text-muted-foreground">PDF, images (JPG/PNG), text, CSV or markdown — up to {MAX_MENUS - menus.length} more</span>
            </label>
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
              <button onClick={onGeneratePairingsClick} disabled={pairingLoading || menus.length === 0} className="rounded-xl px-3 py-1.5 text-xs font-bold text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--brand-orange)" }}>
                <Wand2 className="h-3.5 w-3.5" /> {pairingLoading ? (pairingProgress && pairingProgress.total ? `Pairing ${pairingProgress.done}/${pairingProgress.total}…` : "Pairing…") : "Generate pairings"}
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
                      <button onClick={() => setPendingMenu(m)} className="text-muted-foreground hover:text-foreground" aria-label="Delete menu"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {pairings.length > 0 && (() => {
          const q = pairingSearch.trim().toLowerCase();
          const filtered = q
            ? pairings.filter((p) =>
                [p.item, p.pair_with, p.why, p.category].some((f) => (f || "").toLowerCase().includes(q)),
              )
            : pairings;
          const CAT_META: Record<string, { emoji: string; label: string; tint: string; ink: string }> = {
            wine_bottle: { emoji: "🍾", label: "Wine (Bottle)",       tint: "color-mix(in oklab, var(--brand-orange) 16%, white)", ink: "var(--brand-orange)" },
            wine_glass:  { emoji: "🍷", label: "Wine (Glass)",        tint: "color-mix(in oklab, var(--brand-orange) 8%, white)",  ink: "var(--brand-orange)" },
            cocktail:    { emoji: "🍸", label: "Cocktail",            tint: "color-mix(in oklab, var(--brand-green) 14%, white)",  ink: "var(--brand-green)" },
            sake:        { emoji: "🍶", label: "Sake",                tint: "color-mix(in oklab, var(--brand-orange) 10%, white)", ink: "var(--brand-orange)" },
            beer:        { emoji: "🍺", label: "Beer",                tint: "color-mix(in oklab, var(--brand-green) 10%, white)",  ink: "var(--brand-green)" },
            spirit:      { emoji: "🥃", label: "Spirit",              tint: "color-mix(in oklab, var(--brand-orange) 10%, white)", ink: "var(--brand-orange)" },
            dessert:     { emoji: "🍰", label: "Dessert",             tint: "color-mix(in oklab, var(--brand-green) 10%, white)",  ink: "var(--brand-green)" },
            other:       { emoji: "✨", label: "Other",               tint: "var(--muted)",                                         ink: "var(--muted-foreground)" },
          };
          const CAT_ORDER = ["wine_bottle", "wine_glass", "cocktail", "sake", "beer", "spirit", "dessert", "other"];
          const STYLE_META: Record<string, { label: string; bg: string; fg: string }> = {
            white:     { label: "White",     bg: "color-mix(in oklab, oklch(0.92 0.13 95) 70%, white)",  fg: "oklch(0.42 0.10 80)" },
            red:       { label: "Red",       bg: "color-mix(in oklab, oklch(0.55 0.20 25) 28%, white)", fg: "oklch(0.40 0.18 25)" },
            rose:      { label: "Rosé",      bg: "color-mix(in oklab, oklch(0.78 0.14 10) 35%, white)", fg: "oklch(0.45 0.16 10)" },
            champagne: { label: "Champagne", bg: "color-mix(in oklab, oklch(0.85 0.13 90) 50%, white)", fg: "oklch(0.45 0.10 80)" },
          };
          const parseWine = (raw: string): { styleKey: string | null; name: string } => {
            const m = raw.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
            if (!m) return { styleKey: null, name: raw };
            const tag = m[1].toLowerCase();
            let styleKey: string | null = null;
            if (/champ|sparkl|prosec|cava|crémant|cremant/.test(tag)) styleKey = "champagne";
            else if (/ros[eé]/.test(tag)) styleKey = "rose";
            else if (/red/.test(tag)) styleKey = "red";
            else if (/white|blanc/.test(tag)) styleKey = "white";
            return { styleKey, name: m[2] || raw };
          };
          const itemEmoji = (name: string) => {
            const n = name.toLowerCase();
            if (/(salmon|tuna|cod|sea bass|prawn|shrimp|oyster|scallop|fish|crab|lobster)/.test(n)) return "🐟";
            if (/(beef|steak|burger|ribeye|sirloin)/.test(n)) return "🥩";
            if (/(chicken|poultry|duck)/.test(n)) return "🍗";
            if (/(pork|bacon|ham)/.test(n)) return "🥓";
            if (/(pasta|spaghetti|linguine|risotto)/.test(n)) return "🍝";
            if (/(pizza)/.test(n)) return "🍕";
            if (/(salad|greens|rocket)/.test(n)) return "🥗";
            if (/(soup|broth|miso)/.test(n)) return "🍲";
            if (/(burrata|cheese|mozzarella)/.test(n)) return "🧀";
            if (/(dessert|cake|chocolate|tart|ice cream|sorbet)/.test(n)) return "🍰";
            return "🍽️";
          };
          const groups = new Map<string, Pairing[]>();
          for (const p of filtered) {
            const key = p.item || "Other";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(p);
          }
          return (
            <div className="mt-6 rounded-2xl bg-white border border-border p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h3 className="font-display font-bold inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-orange" /> AI pairings across your menus
                </h3>
                <input
                  value={pairingSearch}
                  onChange={(e) => setPairingSearch(e.target.value)}
                  placeholder="🔍 Search a food item, drink or dessert…"
                  className="rounded-xl border border-border px-3 py-2 text-sm w-full sm:w-72"
                />
              </div>
              <div className="text-xs text-muted-foreground mb-4">
                {filtered.length} pairing{filtered.length === 1 ? "" : "s"} across {groups.size} item{groups.size === 1 ? "" : "s"} — up to 3 premium picks per category.
              </div>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pairings match "{pairingSearch}".</p>
              ) : (
                <div className="space-y-5">
                  {Array.from(groups.entries()).map(([item, rows]) => {
                    const byCat = new Map<string, Pairing[]>();
                    const hasStyleTag = (s: string) => /^\s*\[(white|red|ros[eé]|champ|sparkl|prosec|cava|cr[eé]mant|blanc)/i.test(s);
                    const looksLikeGlass = (s: string) => /\b(glass|125\s*ml|175\s*ml|by\s*the\s*glass)\b/i.test(s);
                    for (const r of rows) {
                      let c = (r.category || "other").toLowerCase();
                      if (c === "wine") c = "wine_bottle"; // legacy rows
                      // Reclassify any legacy "other" row that is clearly a wine
                      if (c === "other" && hasStyleTag(r.pair_with)) {
                        c = looksLikeGlass(r.pair_with) ? "wine_glass" : "wine_bottle";
                      }
                      if (!byCat.has(c)) byCat.set(c, []);
                      byCat.get(c)!.push(r);
                    }
                    const orderedCats = CAT_ORDER.filter((c) => byCat.has(c)).concat(
                      Array.from(byCat.keys()).filter((c) => !CAT_ORDER.includes(c)),
                    );
                    return (
                      <div key={item} className="rounded-2xl border border-border overflow-hidden"
                        style={{ background: "color-mix(in oklab, var(--brand-orange) 4%, white)" }}>
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-border bg-white">
                          <div className="h-10 w-10 rounded-xl grid place-items-center text-xl"
                            style={{ background: "color-mix(in oklab, var(--brand-orange) 12%, white)" }}>
                            {itemEmoji(item)}
                          </div>
                          <div className="font-display font-bold text-base">{item}</div>
                        </div>
                        <div className="p-4 grid sm:grid-cols-2 gap-3">
                          {orderedCats.map((cat) => {
                            const meta = CAT_META[cat] || CAT_META.other;
                            const picks = byCat.get(cat)!.slice(0, 3);
                            const isWine = cat === "wine_bottle" || cat === "wine_glass";
                            return (
                              <div key={cat} className="rounded-xl border border-border bg-white p-3">
                                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-2 px-2 py-1 rounded-md"
                                  style={{ background: meta.tint, color: meta.ink }}>
                                  <span className="text-base leading-none">{meta.emoji}</span> {meta.label}
                                </div>
                                <ul className="space-y-2">
                                  {picks.map((p, i) => {
                                    const wine = isWine ? parseWine(p.pair_with) : null;
                                    const style = wine?.styleKey ? STYLE_META[wine.styleKey] : null;
                                    const displayName = wine ? wine.name : p.pair_with;
                                    const hasPrice = /[£$€]\s*\d|\d+\s*(gbp|usd|eur)\b/i.test(displayName);
                                    return (
                                      <li key={i} className="text-sm">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                          <div className="flex items-center gap-2 min-w-0">
                                            {style && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                                style={{ background: style.bg, color: style.fg }}>
                                                {style.label}
                                              </span>
                                            )}
                                            <span className="font-semibold">{displayName}</span>
                                            {!hasPrice && (
                                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                                price on menu
                                              </span>
                                            )}
                                          </div>
                                          {p.priority === "High" && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                              style={{ background: "color-mix(in oklab, var(--brand-orange) 18%, white)", color: "var(--brand-orange)" }}>
                                              ⭐ Top
                                            </span>
                                          )}
                                        </div>
                                        {p.why && <div className="text-xs text-muted-foreground mt-0.5">{p.why}</div>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        <div className="mt-5 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
          <div className="text-sm">Weekly priorities are auto-generated from your menus when you upload stats.</div>
          <Link to="/manager/priorities" className="rounded-lg px-4 py-2 text-sm font-bold inline-flex items-center gap-2"
            style={{ background: "var(--brand-green)", color: "white" }}>
            View priorities <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <ConfirmDeleteDialog
        open={!!pendingMenu}
        onOpenChange={(o) => { if (!o) setPendingMenu(null); }}
        title="Delete this menu?"
        description="Only this menu file will be removed from the system. Your other menus, pairings, server stats and priorities are not affected. This cannot be undone."
        loading={deletingMenu}
        onConfirm={confirmRemoveMenu}
      />
      <ConfirmDeleteDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        title="Regenerate pairings?"
        description="Regenerating will replace your current pairings with a new set. The old pairings will be discarded. Continue?"
        confirmLabel="Regenerate"
        onConfirm={() => { void generatePairings(); }}
      />
    </ManagerLayout>
  );
}
