// AI helper for menu parsing, pairings, priorities, and coaching.
// Uses LOVABLE_API_KEY (server-side) to call Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function isAbortError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /abort|timeout|timed out/i.test(msg);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries = 1,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (!isAbortError(e) || attempt === retries) throw e;
      console.warn(`[ai-assist] request aborted (attempt ${attempt + 1}), retrying…`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

async function callGemini(messages: any[], json: boolean): Promise<string> {
  const body: any = { model: "google/gemini-2.5-flash", messages };
  if (json) body.response_format = { type: "json_object" };
  const r = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 500)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callOpenAI(messages: any[], json: boolean): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const body: any = { model: "gpt-4o-mini", messages };
  if (json) body.response_format = { type: "json_object" };
  const r = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  }, 120000, 1);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 500)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callAI(messages: any[], json = false): Promise<string> {
  // Primary: Lovable AI Gateway (Gemini). Fallback: OpenAI gpt-4o-mini.
  try {
    const out = await callGemini(messages, json);
    console.log("[ai-assist] provider=gemini ok");
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[ai-assist] gemini failed, falling back to openai:", msg);
    if (!OPENAI_API_KEY) {
      throw new Error(
        "Image extraction failed. Please try again or upload a clearer image.",
      );
    }
    try {
      const out = await callOpenAI(messages, json);
      console.log("[ai-assist] provider=openai (fallback) ok");
      return out;
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      console.error("[ai-assist] openai fallback also failed:", msg2);
      throw new Error(
        "Image extraction failed. Please try again or upload a clearer image.",
      );
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { action, venueId, payload } = await req.json();

    // verify caller manages this venue (or, for server_coaching, is the server themselves)
    const { data: v } = await admin.from("venues").select("id, manager_id").eq("id", venueId).maybeSingle();
    const isManager = !!v && v.manager_id === u.user.id;
    let isSelfServer = false;
    if (!isManager && action === "server_coaching" && payload?.userId === u.user.id) {
      const { data: mem } = await admin.from("venue_members").select("user_id").eq("venue_id", venueId).eq("user_id", u.user.id).maybeSingle();
      isSelfServer = !!mem;
    }
    if (!v || (!isManager && !isSelfServer)) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (action === "parse_stats_image") {
      const images: string[] = Array.isArray(payload?.images) ? payload.images.slice(0, 4) : [];
      const validImages = images.filter((u) => typeof u === "string" && u.startsWith("data:image/"));
      console.log("[ai-assist] action=parse_stats_image images=", validImages.length);
      if (!validImages.length) {
        return new Response(JSON.stringify({ error: "no images provided" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const totalBytes = validImages.reduce((n, s) => n + s.length, 0);
      if (totalBytes > 6_000_000) {
        console.warn("[ai-assist] payload too large:", totalBytes);
        return new Response(JSON.stringify({ error: "Images too large — please upload fewer or smaller images." }), { status: 413, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const sys = "You are an OCR and data-extraction assistant for restaurant server-performance reports. Read every image carefully and extract one row per individual server/staff member. Reply ONLY with JSON: {\"rows\":[{\"server_name\":string,\"total_covers\":number,\"total_sales\":number,\"categories\":[{\"label\":string,\"quantity\":number,\"net_sales\":number}]}],\"week_start\":string|null,\"confidence\":number,\"notes\":string}. RULES: (1) Read EVERY column header in the report. Each non-total product/category column becomes one entry in `categories`. Pair sibling 'Quantity'+'Net' (or 'Qty'+'Sales', 'Units'+'Revenue', etc.) columns under the same category label. If only one of the pair exists, fill it and set the other to 0. (2) Use the column header text verbatim as `label` (e.g. 'Salted Edamame', 'SESAME CRACKERS', 'Wine', 'Dessert'). Do NOT invent or rename categories. (3) Skip TOTAL / SUMMARY rows entirely. The 'Total Quantity' / 'Total Net' trailing columns become `total_sales` (use Total Net) — do NOT include them in `categories`. If the report has no covers column, set total_covers to 0. (4) Negative values are allowed (refunds) — preserve the sign. (5) If the same server appears across multiple images, MERGE their categories into ONE row (sum quantities and net_sales per category label). (6) Numbers MUST be plain — strip £, $, €, commas, %. Empty cells = 0. (7) confidence 0-1; use <0.5 if blurry / cropped / critical fields missing. (8) week_start: ISO Monday date YYYY-MM-DD if visible, else null. (9) notes: brief issue description if confidence<0.7.";
      const userContent: any[] = [{ type: "text", text: "Extract server sales rows from these report images. Use the dynamic categories format described in the system prompt." }];
      for (const url of validImages) userContent.push({ type: "image_url", image_url: { url } });
      const out = await callAI([
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ], true);
      let parsed: any = { rows: [], confidence: 0, notes: "" };
      try { parsed = JSON.parse(out); } catch {}

      const slugify = (s: string) =>
        String(s || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 60) || "category";

      const LEGACY_KEYS: Record<string, string> = {
        wine: "wine_sales",
        wines: "wine_sales",
        dessert: "dessert_sales",
        desserts: "dessert_sales",
        cocktail: "cocktail_sales",
        cocktails: "cocktail_sales",
        side: "sides_sales",
        sides: "sides_sales",
        spirit: "spirits_sales",
        spirits: "spirits_sales",
        sparkling: "sparkling_sales",
        champagne: "sparkling_sales",
      };

      const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r: any) => {
        const categoriesMap: Record<string, { label: string; sales: number; quantity: number; metric_type: "sales" | "quantity" }> = {};
        const legacy: Record<string, number> = {
          wine_sales: 0,
          dessert_sales: 0,
          cocktail_sales: 0,
          sides_sales: 0,
          spirits_sales: 0,
          sparkling_sales: 0,
        };
        const cats = Array.isArray(r.categories) ? r.categories : [];
        for (const c of cats) {
          const label = String(c?.label || "").trim();
          if (!label) continue;
          const net = Number(c?.net_sales ?? c?.sales ?? 0) || 0;
          const qty = Number(c?.quantity ?? 0) || 0;
          if (!net && !qty) continue;
          const key = slugify(label);
          const existing = categoriesMap[key];
          if (existing) {
            existing.sales += net;
            existing.quantity += qty;
            existing.metric_type = existing.sales !== 0 ? "sales" : "quantity";
          } else {
            categoriesMap[key] = {
              label,
              sales: net,
              quantity: qty,
              metric_type: net !== 0 ? "sales" : "quantity",
            };
          }
          const legacyKey = LEGACY_KEYS[key];
          if (legacyKey) legacy[legacyKey] += net;
        }

        const catSalesSum = Object.values(categoriesMap).reduce((s, v) => s + v.sales, 0);
        const rawTotal = Number(r.total_sales) || 0;
        const totalSales = rawTotal !== 0 ? rawTotal : catSalesSum;

        return {
          server_name: String(r.server_name || "").trim(),
          total_covers: Number(r.total_covers) || 0,
          total_sales: totalSales,
          ...legacy,
          categories: categoriesMap,
        };
      }).filter((r: any) =>
        r.server_name &&
        (r.total_sales !== 0 || r.total_covers > 0 || Object.keys(r.categories).length > 0),
      );

      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      return Response.json({
        ok: true,
        rows,
        confidence,
        week_start: parsed.week_start || null,
        notes: String(parsed.notes || ""),
      }, { headers: cors });
    }

    if (action === "parse_menu") {
      const text = String(payload?.menu_text ?? "").slice(0, 20000);
      const images: string[] = Array.isArray(payload?.images) ? payload.images.slice(0, 8) : [];
      const sys = "You are a menu parser. Extract every menu item from the provided text and/or images (OCR them). Reply ONLY with JSON: {\"items\":[{\"name\":string,\"category\":string,\"price\":string,\"pairing\":string,\"priority\":\"High Priority\"|\"Standard\"}]}. Pairing is a specific wine/cocktail/side that pairs well (e.g. 'Sancerre' with salmon). Max 80 items.";
      const userContent: any[] = [];
      if (text.trim()) userContent.push({ type: "text", text });
      for (const url of images) {
        if (typeof url === "string" && url.startsWith("data:image/")) {
          userContent.push({ type: "image_url", image_url: { url } });
        }
      }
      if (userContent.length === 0) userContent.push({ type: "text", text: "(empty)" });
      const out = await callAI([
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ], true);
      let items: any[] = [];
      try { const o = JSON.parse(out); items = o.items ?? o.menu ?? []; } catch {}
      const stored = text.trim() || `# Visual menu\n${items.map((i: any) => `${i.name}${i.price ? " " + i.price : ""}`).join("\n")}`;
      const ins = await admin.from("venue_menu").insert({ venue_id: venueId, menu_text: stored.slice(0, 20000), parsed_items: items }).select().single();
      // Invalidate cached server coaching so every server in the venue regenerates against the new menu
      await admin.from("server_coaching").delete().eq("venue_id", venueId);
      return Response.json({ ok: true, items, menu: ins.data }, { headers: cors });
    }

    if (action === "invalidate_coaching") {
      await admin.from("server_coaching").delete().eq("venue_id", venueId);
      return Response.json({ ok: true }, { headers: cors });
    }

    if (action === "list_food_items") {
      // Manager is about to regenerate pairings — wipe stale per-server coaching too
      await admin.from("server_coaching").delete().eq("venue_id", venueId);
      const { data: menus } = await admin.from("venue_menu").select("menu_text, parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(10);
      const summary = (menus ?? []).map((m, i) => `--- Menu ${i + 1} ---\n${m.menu_text?.slice(0, 3500) || JSON.stringify(m.parsed_items)?.slice(0, 3500)}`).join("\n\n");
      const sys = "Extract ONLY the food item names (starters, mains, sides — NOT drinks, NOT desserts) from the menus below. Reply ONLY with JSON: {\"items\":[string]}. Use exact menu names. Max 60 items.";
      const out = await callAI([{ role: "system", content: sys }, { role: "user", content: summary }], true);
      let items: string[] = [];
      try { const o = JSON.parse(out); items = (o.items ?? []).map((x: any) => String(x)).filter(Boolean); } catch {}
      return Response.json({ ok: true, items }, { headers: cors });
    }

    if (action === "pair_chunk") {
      const items: string[] = Array.isArray(payload?.items) ? payload.items.slice(0, 8) : [];
      if (items.length === 0) return Response.json({ ok: true, pairings: [] }, { headers: cors });
      const { data: menus } = await admin.from("venue_menu").select("menu_text, parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(10);
      const summary = (menus ?? []).map((m, i) => `--- Menu ${i + 1} ---\n${m.menu_text?.slice(0, 3500) || JSON.stringify(m.parsed_items)?.slice(0, 3500)}`).join("\n\n");
      const sys = "You are an expert sommelier, mixologist and pastry chef. For ONLY the food items listed by the user, produce pairings drawn from the venue's actual drinks/desserts menus. Categories to use ONLY: wine_bottle (wines sold by the bottle), wine_glass (wines available by the glass — look for 'by the glass', '125ml', '175ml', 'glass' markers), cocktail, sake, beer, spirit, dessert. NEVER use 'other' — every wine MUST be classified as either wine_bottle OR wine_glass. RULES: (1) For each food item × category, give UP TO 3 suggestions but ONLY if that many genuinely pair well — if only 2 truly suit, return just those 2; if none, omit. (2) When more than 3 pair well, pick the 3 MOST EXPENSIVE / premium options to maximise upsell. (3) Use ACTUAL menu items by name. (4) PRICE IS MANDATORY: every pair_with value MUST end with the menu price (e.g. '£62', '£14.50'). If a price is not shown on the menu for that item, DO NOT include it in the output. (5) For BOTH wine_bottle AND wine_glass, the pair_with value MUST start with a style tag in square brackets: [White], [Red], [Rosé], or [Champagne] (use [Champagne] for any sparkling/prosecco/cava/crémant). Format: '[Style] Wine Name Year £Price'. Example: '[White] Sancerre 2022 £62'. (6) wine_bottle and wine_glass MUST be drawn from different price tiers when possible — never repeat the same wine in both. (7) Output one row per (food item, single pairing). Reply ONLY with JSON: {\"pairings\":[{\"item\":string,\"pair_with\":string,\"category\":\"wine_bottle\"|\"wine_glass\"|\"cocktail\"|\"sake\"|\"beer\"|\"spirit\"|\"dessert\",\"why\":string,\"priority\":\"High\"|\"Medium\"|\"Low\"}]}. Order within each (food, category) group most-to-least premium.";
      const usr = `Food items to pair:\n${items.map((s) => `- ${s}`).join("\n")}\n\nMenus:\n${summary}`;
      const out = await callAI([{ role: "system", content: sys }, { role: "user", content: usr }], true);
      let pairings: any[] = [];
      try { const o = JSON.parse(out); pairings = o.pairings ?? []; } catch {}

      // Persist for caching
      const rows = pairings.slice(0, 200).map((p: any, idx: number) => ({
        venue_id: venueId,
        item: String(p.item || "").slice(0, 200),
        category: String(p.category || "other").toLowerCase().slice(0, 30),
        pair_with: String(p.pair_with || "").slice(0, 200),
        why: p.why ? String(p.why).slice(0, 600) : null,
        priority: p.priority ? String(p.priority).slice(0, 20) : null,
        position: idx,
      })).filter((r: any) => r.item && r.pair_with);
      if (rows.length) {
        await admin.from("venue_pairings").upsert(rows, { onConflict: "venue_id,item,category,pair_with" });
      }
      return Response.json({ ok: true, pairings }, { headers: cors });
    }

    if (action === "generate_priorities") {
      const weekStart = payload?.weekStart;
      const { data: stats } = await admin.from("server_stats").select("*").eq("venue_id", venueId).eq("week_start", weekStart);
      const { data: targets } = await admin.from("server_targets").select("*").eq("venue_id", venueId);
      const { data: menus } = await admin.from("venue_menu").select("parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(10);
      const menuItems = (menus ?? []).flatMap((m: any) => (m.parsed_items ?? [])).slice(0, 80).map((i: any) => `${i.name}${i.category ? " ("+i.category+")" : ""}`).join(", ");
      const tgt = targets?.[0];
      const cats = ["wine", "dessert", "cocktail", "sides", "spirits", "sparkling"];
      const avgs: Record<string, number> = {};
      for (const c of cats) {
        const key = `${c}_conversion`;
        const vals = (stats ?? []).map((s: any) => Number(s[key] ?? 0)).filter(Boolean);
        avgs[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      }
      const gaps = cats.map((c) => `${c}: avg ${avgs[c].toFixed(0)}% vs target ${Number((tgt as any)?.[`${c}_target`] ?? 0)}%`).join(", ");
      const sys = "You are a hospitality coach. Given the team's weak categories and the venue menu items, choose 3-5 specific menu items to PUSH this week. Reply ONLY with JSON: {\"priorities\":[{\"item_name\":string,\"category\":string,\"priority_flag\":\"push\"|\"seasonal\"|\"standard\",\"reason\":string}]}";
      const usr = `Team performance gaps: ${gaps}.\nMenu items available: ${menuItems || "(none uploaded)"}\nReturn 3-5 priorities targeting the weakest categories using actual menu items where possible.`;
      const out = await callAI([{ role: "system", content: sys }, { role: "user", content: usr }], true);
      let priorities: any[] = [];
      try { const o = JSON.parse(out); priorities = o.priorities ?? []; } catch {}
      // delete old auto priorities for this week, then insert
      await admin.from("weekly_priorities").delete().eq("venue_id", venueId).eq("week_start", weekStart);
      if (priorities.length) {
        await admin.from("weekly_priorities").insert(priorities.map((p) => ({
          venue_id: venueId, week_start: weekStart,
          item_name: String(p.item_name || "Untitled").slice(0, 120),
          category: p.category ? String(p.category).slice(0, 60) : null,
          priority_flag: ["push", "seasonal", "standard", "hold"].includes(p.priority_flag) ? p.priority_flag : "push",
        })));
      }
      return Response.json({ ok: true, priorities }, { headers: cors });
    }

    if (action === "server_coaching") {
      const weekStart = payload?.weekStart;
      const userId = payload?.userId;
      const force = !!payload?.force;
      if (!userId || !weekStart) {
        return new Response(JSON.stringify({ error: "userId and weekStart required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      // Only managers may force regenerate
      const effectiveForce = force && isManager;
      if (!effectiveForce) {
        const { data: cached } = await admin.from("server_coaching").select("suggestions, generated_at").eq("user_id", userId).eq("venue_id", venueId).eq("week_start", weekStart).maybeSingle();
        if (cached?.suggestions && Array.isArray(cached.suggestions) && (cached.suggestions as any[]).length > 0) {
          // Only reuse the cache if it was generated AFTER the latest menu upload AND the latest pairings.
          // Otherwise the tips reference stale menu items and must be regenerated.
          const [{ data: latestMenu }, { data: latestPairing }] = await Promise.all([
            admin.from("venue_menu").select("uploaded_at").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
            admin.from("venue_pairings").select("generated_at").eq("venue_id", venueId).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          const cachedAt = new Date(cached.generated_at).getTime();
          const menuAt = latestMenu?.uploaded_at ? new Date(latestMenu.uploaded_at).getTime() : 0;
          const pairAt = latestPairing?.generated_at ? new Date(latestPairing.generated_at).getTime() : 0;
          if (cachedAt >= menuAt && cachedAt >= pairAt) {
            return Response.json({ ok: true, suggestions: cached.suggestions, cached: true }, { headers: cors });
          }
          console.log("[ai-assist] coaching cache stale (menu/pairings newer) — regenerating");
        }
      }
      const { data: cur } = await admin.from("server_stats").select("*").eq("venue_id", venueId).eq("user_id", userId).eq("week_start", weekStart).maybeSingle();
      if (!cur) {
        return Response.json({ ok: true, suggestions: [], cached: false, reason: "no_stats" }, { headers: cors });
      }
      const { data: prev } = await admin.from("server_stats").select("*").eq("venue_id", venueId).eq("user_id", userId).lt("week_start", weekStart).order("week_start", { ascending: false }).limit(1).maybeSingle();
      const { data: tg } = await admin.from("server_targets").select("*").eq("venue_id", venueId).eq("user_id", userId).maybeSingle();
      const { data: menus } = await admin.from("venue_menu").select("parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(3);
      const menuItems = (menus ?? []).flatMap((m: any) => (m.parsed_items ?? [])).slice(0, 60);
      // Prefer dynamic venue categories; fall back to legacy six if none exist.
      const { data: vcRows } = await admin.from("venue_categories").select("key,label,sort_order").eq("venue_id", venueId).order("sort_order");
      const { data: curCats } = await admin.from("server_category_stats").select("category_key,conversion,metric_type,quantity").eq("venue_id", venueId).eq("user_id", userId).eq("week_start", weekStart);
      const { data: prevCats } = prev?.week_start
        ? await admin.from("server_category_stats").select("category_key,conversion").eq("venue_id", venueId).eq("user_id", userId).eq("week_start", prev.week_start)
        : { data: [] as any[] };
      const { data: catTargets } = await admin.from("server_category_targets").select("category_key,target").eq("venue_id", venueId).eq("user_id", userId);
      const curMap = Object.fromEntries(((curCats ?? []) as any[]).map((r) => [r.category_key, r]));
      const prevMap = Object.fromEntries(((prevCats ?? []) as any[]).map((r) => [r.category_key, r]));
      const tgtMap = Object.fromEntries(((catTargets ?? []) as any[]).map((r) => [r.category_key, Number(r.target) || 0]));
      const dynCats = (vcRows ?? []) as { key: string; label: string }[];
      const LEGACY_SIX = new Set(["wine", "dessert", "cocktail", "sides", "spirits", "sparkling"]);
      const cats = dynCats.length ? dynCats.map((c) => c.key) : Array.from(LEGACY_SIX);
      const labelFor = (k: string) => dynCats.find((c) => c.key === k)?.label || k;
      // Per-category fallback: prefer dynamic server_category_stats when present;
      // otherwise fall back to legacy server_stats.<cat>_conversion columns so
      // venues that only upload CSV legacy data still get real numbers.
      const lines = cats.map((c) => {
        const hasDyn = !!curMap[c];
        let a = hasDyn ? Number(curMap[c]?.conversion ?? 0) : 0;
        let p = hasDyn ? Number(prevMap[c]?.conversion ?? 0) : 0;
        let t = hasDyn ? Number(tgtMap[c] ?? 0) : 0;
        if (!hasDyn && LEGACY_SIX.has(c)) {
          a = Number((cur as any)?.[`${c}_conversion`] ?? 0);
          p = Number((prev as any)?.[`${c}_conversion`] ?? 0);
          t = Number((tg as any)?.[`${c}_target`] ?? 0);
        }
        if (a === 0 && t === 0) return null;
        const delta = p ? (a - p) : 0;
        return `${labelFor(c)}: ${a.toFixed(1)}% (target ${t.toFixed(1)}%, ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs last week)`;
      }).filter(Boolean).join("\n");
      const spc = Number((cur as any)?.spend_per_cover ?? 0);
      const spcTarget = Number((tg as any)?.spend_per_cover_target ?? 0);
      const catList = cats.map(labelFor).concat(["general"]).join("|");
      const sys = `You are a hospitality coach producing PERSONAL coaching tips for ONE specific server based on THEIR own weekly stats. Reply ONLY with JSON: {"suggestions":[{"category":string,"tip":string}]}. The "category" MUST be one of: ${catList}. RULES: (1) Return 3-4 tips. (2) PRIORITISE the 1-2 categories where this server is FURTHEST BELOW their target — those tips are mandatory. (3) Optionally include 1 tip celebrating a category they are above target on. (4) EVERY tip MUST cite the server's EXACT number(s) for that category from the data provided, copied VERBATIM with the same digits and decimal point — do NOT round, re-calculate, or invent values. If the data says "8.5%" you MUST write "8.5%", never "9%". (5) Tips MUST be actionable and reference a real menu item from the list when relevant. (6) Keep each tip to 1-2 short sentences. (7) NEVER mention a category whose numbers were not provided in the data below.`;
      const usr = `This server's week (use these EXACT values, do not round):\nSpend per cover: £${spc.toFixed(2)} (target £${spcTarget.toFixed(2)})\n${lines}\nMenu items: ${menuItems.map((i: any) => i.name).filter(Boolean).slice(0, 40).join(", ") || "(none)"}`;
      const out = await callAI([{ role: "system", content: sys }, { role: "user", content: usr }], true);
      let suggestions: any[] = [];
      try { const o = JSON.parse(out); suggestions = o.suggestions ?? []; } catch {}
      await admin.from("server_coaching").upsert({
        venue_id: venueId, user_id: userId, week_start: weekStart, suggestions, generated_at: new Date().toISOString(),
      }, { onConflict: "user_id,venue_id,week_start" });
      return Response.json({ ok: true, suggestions, cached: false }, { headers: cors });
    }

    if (action === "coaching") {
      const weekStart = payload?.weekStart;
      const { data: stats } = await admin.from("server_stats").select("*").eq("venue_id", venueId).eq("week_start", weekStart);
      const { data: pr } = await admin.from("weekly_priorities").select("*").eq("venue_id", venueId).eq("week_start", weekStart);
      const summary = (stats ?? []).map((s: any) => `SPC £${Number(s.spend_per_cover ?? 0).toFixed(0)}, wine ${Number(s.wine_conversion ?? 0).toFixed(0)}%, dessert ${Number(s.dessert_conversion ?? 0).toFixed(0)}%, cocktail ${Number(s.cocktail_conversion ?? 0).toFixed(0)}%`).join("\n");
      const items = (pr ?? []).map((p: any) => `${p.item_name} (${p.priority_flag})`).join(", ") || "none";
      const out = await callAI([
        { role: "system", content: "You are a restaurant coaching expert. Give 4-6 short, punchy talking points (one line each) for a manager's pre-shift huddle. Warm, direct tone. No headings, no markdown — just plain numbered lines." },
        { role: "user", content: `Priorities: ${items}\nServer stats:\n${summary || "no stats yet"}` },
      ]);
      return Response.json({ ok: true, text: out }, { headers: cors });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[ai-assist] handler error:", e instanceof Error ? e.stack || e.message : String(e));
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
