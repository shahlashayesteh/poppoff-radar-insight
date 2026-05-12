## Diagnosis

The toast "Edge Function returned a non-2xx status code" is the **generic** message that `supabase.functions.invoke` always throws on any non-2xx — it is **not** the actual cause. The real reason is hidden in the response body, which the current client code never reads.

Edge function logs only show `booted` lines and no `[ai-assist] ...` messages from our `callAI` fallback. That means one of two things is happening:

1. The handler **does** throw, but the outer `catch (e)` returns a 500 JSON `{error: "..."}` **without calling `console.error`** — so it never appears in logs (lines 319–321 of `ai-assist/index.ts`).
2. The request is rejected before the handler runs (auth/JWT expired, or the combined base64 image payload exceeds the edge body limit — the recent client-side image compression mitigates this but doesn't prevent very large multi-image uploads).

Either way the client surfaces only the generic non-2xx error, so we cannot tell which it is from the user side.

The Gemini → OpenAI fallback added earlier **is** still in place and correct; the problem is purely that errors aren't being **reported** to the user or to logs.

## Fix plan (3 small, surgical changes)

### 1. `supabase/functions/ai-assist/index.ts` — log every failure
- In the outer `try/catch` (around line 319), add `console.error("[ai-assist] handler error:", e)` before returning the 500 JSON.
- For `parse_stats_image`, add a defensive size guard: if total length of all base64 `validImages` strings exceeds ~6,000,000 chars, return `{ error: "Images too large — please upload fewer or smaller images." }` with status 413 before calling the AI gateway.
- Log at request entry: `console.log("[ai-assist] action=", action, "images=", validImages?.length)` for the image action so we can see whether requests even arrive.

### 2. `src/routes/manager.index.tsx` — surface the real error to the user
The `supabase.functions.invoke` JS client puts the response body on `error.context` (a `Response` object). Read it and prefer its `error` field in the toast.

Change the two `invoke("ai-assist", ...)` callsites (image OCR at ~line 303 and `generate_priorities` at ~line 297) to:

```ts
const { data, error } = await supabase.functions.invoke("ai-assist", { body: { ... } });
if (error) {
  let serverMsg = error.message;
  try {
    const j = await (error as any).context?.json?.();
    if (j?.error) serverMsg = j.error;
  } catch { /* ignore */ }
  throw new Error(serverMsg);
}
```

This turns "Edge Function returned a non-2xx status code" into the real reason (e.g. `Gemini 429: ...`, `Images too large`, `unauthorized`, or the friendly `Image extraction failed. Please try again or upload a clearer image.` we already throw from `callAI`).

### 3. No other changes
- Gemini stays primary; OpenAI fallback stays untouched.
- No changes to calculations, ring colors, targets, thresholds, schema, OCR prompts, ring scoring, dashboard logic, dynamic categories, CSV uploads, or styling.
- Client-side image compression (1600px / JPEG q0.82) stays as-is.

## What we expect after deploy

- If Gemini was returning 429/402/5xx and the deployed version didn't have the fallback yet, the new fallback kicks in (already shipped) and uses OpenAI.
- If the payload was too large, the user now sees: **"Images too large — please upload fewer or smaller images."**
- If the session token was expired, the user sees: **"unauthorized"** instead of the generic message, and we know to suggest re-logging in.
- All future failures will appear in edge function logs with the `[ai-assist]` prefix so we can diagnose without guessing.

## Files to change

- `supabase/functions/ai-assist/index.ts` — outer catch logging + payload size guard + entry log
- `src/routes/manager.index.tsx` — read `error.context` body at the two `invoke("ai-assist", ...)` sites

No other files touched.