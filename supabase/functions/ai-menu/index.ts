// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { menu_text } = await req.json();
    if (!menu_text || typeof menu_text !== "string") {
      return new Response(JSON.stringify({ error: "menu_text is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a restaurant sales coach. Analyse the provided menu and give actionable, specific advice. Return JSON via the analyze_menu tool only." },
          { role: "user", content: `Menu:\n\n${menu_text}\n\nIdentify: 1) Top 3 high margin dishes to upsell. 2) Top 3 wine pairings for current dishes. 3) Top 3 slow moving items that need pushing. 4) One key coaching tip for servers this week.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_menu",
            description: "Return menu analysis",
            parameters: {
              type: "object",
              properties: {
                high_margin: { type: "array", items: { type: "object", properties: { name: { type: "string" }, why: { type: "string" } }, required: ["name","why"] } },
                wine_pairings: { type: "array", items: { type: "object", properties: { dish: { type: "string" }, wine: { type: "string" }, why: { type: "string" } }, required: ["dish","wine","why"] } },
                slow_movers: { type: "array", items: { type: "object", properties: { name: { type: "string" }, push: { type: "string" } }, required: ["name","push"] } },
                weekly_tip: { type: "string" },
              },
              required: ["high_margin","wine_pairings","slow_movers","weekly_tip"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_menu" } },
      }),
    });

    if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!response.ok) {
      const t = await response.text();
      console.error("AI menu error", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const json = await response.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    if (!parsed) throw new Error("No tool call returned");
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
