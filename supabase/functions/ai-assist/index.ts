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

async function callAI(messages: any[], json = false) {
  const body: any = {
    model: "google/gemini-2.5-flash",
    messages,
  };
  if (json) body.response_format = { type: "json_object" };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
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

    // verify caller manages this venue
    const { data: v } = await admin.from("venues").select("id, manager_id").eq("id", venueId).maybeSingle();
    if (!v || v.manager_id !== u.user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (action === "parse_stats_image") {
      const images: string[] = Array.isArray(payload?.images) ? payload.images.slice(0, 4) : [];
      const validImages = images.filter((u) => typeof u === "string" && u.startsWith("data:image/"));
      if (!validImages.length) {
        return new Response(JSON.stringify({ error: "no images provided" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const sys = "You are an OCR and data-extraction assistant for restaurant server-performance reports. Read every image carefully and extract one row per individual server/staff member. Reply ONLY with JSON: {\"rows\":[{\"server_name\":string,\"total_covers\":number,\"total_sales\":number,\"categories\":{<slug>:{\"label\":string,\"sales\":number}}}],\"week_start\":string|null,\"confidence\":number,\"notes\":string}. RULES: (1) confidence is 0-1. Use <0.5 if image is blurry/cropped or fields are missing. (2) Numbers MUST be plain numbers — strip currency symbols, commas, %. (3) `categories` MUST contain EVERY sales category column visible in the report (wine, cocktails, desserts, sides, spirits, sparkling, beer, coffee, starters, mains, pasta, pizza, specials, anything else). Key = lowercase snake_case slug of the column header. Label = the original column header text. If a value is blank, use 0 or omit. (4) Skip TOTAL/SUMMARY rows — only individual servers. (5) week_start: ISO Monday date (YYYY-MM-DD) if visible, else null. (6) notes: short description of issues if confidence<0.7.";
      const userContent: any[] = [{ type: "text", text: "Extract every server's sales row and every sales category column you can see in these report images." }];
      for (const url of validImages) userContent.push({ type: "image_url", image_url: { url } });
      const out = await callAI([
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ], true);
      let parsed: any = { rows: [], confidence: 0, notes: "" };
      try { parsed = JSON.parse(out); } catch {}
      const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r: any) => {
        const cats = (r.categories && typeof r.categories === "object") ? r.categories : {};
        const normCats: Record<string, { label: string; sales: number }> = {};
        for (const [k, v] of Object.entries(cats)) {
          const key = String(k).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
          if (!key) continue;
          const vv = v as any;
          normCats[key] = {
            label: String(vv?.label || k),
            sales: Number(vv?.sales) || 0,
          };
        }
        // Legacy compat: surface the six legacy keys as top-level fields too
        const legacy = (k: string) => Number(normCats[k]?.sales) || Number((r as any)[`${k}_sales`]) || 0;
        return {
          server_name: String(r.server_name || "").trim(),
          total_covers: Number(r.total_covers) || 0,
          total_sales: Number(r.total_sales) || 0,
          wine_sales: legacy("wine"),
          dessert_sales: legacy("dessert") || legacy("desserts"),
          cocktail_sales: legacy("cocktail") || legacy("cocktails"),
          sides_sales: legacy("sides") || legacy("side"),
          spirits_sales: legacy("spirits") || legacy("spirit"),
          sparkling_sales: legacy("sparkling") || legacy("champagne") || legacy("prosecco"),
          categories: normCats,
        };
      }).filter((r: any) => r.server_name && (r.total_sales > 0 || r.total_covers > 0 || Object.keys(r.categories).length > 0));
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
      return Response.json({ ok: true, items, menu: ins.data }, { headers: cors });
    }

    if (action === "list_food_items") {
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
      const { data: vcats } = await admin.from("venue_categories").select("key, label").eq("venue_id", venueId).order("sort_order");
      const { data: catStats } = await admin.from("server_category_stats").select("category_key, conversion").eq("venue_id", venueId).eq("week_start", weekStart);
      const { data: catTargets } = await admin.from("server_category_targets").select("category_key, target").eq("venue_id", venueId);
      const { data: menus } = await admin.from("venue_menu").select("parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(10);
      const menuItems = (menus ?? []).flatMap((m: any) => (m.parsed_items ?? [])).slice(0, 80).map((i: any) => `${i.name}${i.category ? " ("+i.category+")" : ""}`).join(", ");
      const fallback = [
        { key: "wine", label: "Wine" }, { key: "cocktail", label: "Cocktails" },
        { key: "dessert", label: "Desserts" }, { key: "sides", label: "Sides" },
        { key: "spirits", label: "Spirits" }, { key: "sparkling", label: "Sparkling" },
      ];
      const cats = (vcats && vcats.length ? vcats : fallback) as { key: string; label: string }[];
      const avgs: Record<string, number> = {};
      for (const c of cats) {
        const vals = (catStats ?? []).filter((s: any) => s.category_key === c.key).map((s: any) => Number(s.conversion ?? 0)).filter(Boolean);
        avgs[c.key] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
      }
      const targetByKey: Record<string, number> = {};
      for (const t of (catTargets ?? [])) targetByKey[(t as any).category_key] = Number((t as any).target) || 0;
      const gaps = cats.map((c) => `${c.label}: avg ${avgs[c.key].toFixed(0)}% vs target ${(targetByKey[c.key] || 0).toFixed(0)}%`).join(", ");
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
      if (!userId || !weekStart) {
        return new Response(JSON.stringify({ error: "userId and weekStart required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const { data: cached } = await admin.from("server_coaching").select("suggestions, generated_at").eq("user_id", userId).eq("venue_id", venueId).eq("week_start", weekStart).maybeSingle();
      if (cached?.suggestions && Array.isArray(cached.suggestions) && (cached.suggestions as any[]).length > 0) {
        return Response.json({ ok: true, suggestions: cached.suggestions, cached: true }, { headers: cors });
      }
      const { data: vcats } = await admin.from("venue_categories").select("key, label").eq("venue_id", venueId).order("sort_order");
      const { data: curCat } = await admin.from("server_category_stats").select("category_key, sales, conversion").eq("venue_id", venueId).eq("user_id", userId).eq("week_start", weekStart);
      const { data: prevWeekRow } = await admin.from("server_category_stats").select("week_start").eq("venue_id", venueId).eq("user_id", userId).lt("week_start", weekStart).order("week_start", { ascending: false }).limit(1).maybeSingle();
      const prevWeek = (prevWeekRow as any)?.week_start || null;
      const { data: prevCat } = prevWeek
        ? await admin.from("server_category_stats").select("category_key, conversion").eq("venue_id", venueId).eq("user_id", userId).eq("week_start", prevWeek)
        : { data: [] as any[] };
      const { data: catTargets } = await admin.from("server_category_targets").select("category_key, target").eq("venue_id", venueId).eq("user_id", userId);
      const { data: menus } = await admin.from("venue_menu").select("parsed_items").eq("venue_id", venueId).order("uploaded_at", { ascending: false }).limit(3);
      const menuItems = (menus ?? []).flatMap((m: any) => (m.parsed_items ?? [])).slice(0, 60);
      const fallback = [
        { key: "wine", label: "Wine" }, { key: "cocktail", label: "Cocktails" },
        { key: "dessert", label: "Desserts" }, { key: "sides", label: "Sides" },
        { key: "spirits", label: "Spirits" }, { key: "sparkling", label: "Sparkling" },
      ];
      const cats = (vcats && vcats.length ? vcats : fallback) as { key: string; label: string }[];
      const curByKey: Record<string, number> = {};
      for (const r of (curCat ?? [])) curByKey[(r as any).category_key] = Number((r as any).conversion ?? 0);
      const prevByKey: Record<string, number> = {};
      for (const r of (prevCat ?? [])) prevByKey[(r as any).category_key] = Number((r as any).conversion ?? 0);
      const tgtByKey: Record<string, number> = {};
      for (const r of (catTargets ?? [])) tgtByKey[(r as any).category_key] = Number((r as any).target ?? 0);
      const lines = cats.map((c) => {
        const a = curByKey[c.key] ?? 0;
        const p = prevByKey[c.key] ?? 0;
        const t = tgtByKey[c.key] ?? 0;
        const delta = p ? (a - p) : 0;
        return `${c.label}: ${a.toFixed(0)}% (target ${t.toFixed(0)}%, ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs last week)`;
      }).join("\n");
      const sys = "You are a hospitality coach. Given a single server's weekly performance vs target and last week across the venue's tracked sales categories, plus the venue menu, return 3-4 short, specific, actionable coaching tips. Reply ONLY with JSON: {\"suggestions\":[{\"category\":string,\"tip\":string}]}. The category field should be the lowercase name of one of the listed categories (or 'general'). Mention real menu items where helpful.";
      const usr = `Performance:\n${lines}\nMenu items: ${menuItems.map((i: any) => i.name).filter(Boolean).slice(0, 40).join(", ") || "(none)"}`;
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
