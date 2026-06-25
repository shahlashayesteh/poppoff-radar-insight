import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient<any>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<any>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function priceLookup(item: any): string | undefined {
  return item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
}

async function handleSubscriptionUpsert(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("[webhook] No userId in subscription metadata", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const priceId = priceLookup(item);
  const productId = typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function dispatchEvent(event: any, env: StripeEnv) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object, env);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      return;
    default:
      console.log("[webhook] Unhandled event:", event.type);
  }
}

/**
 * Phase 12 — idempotent webhook handler.
 *
 * 1. Verify Stripe signature.
 * 2. Reserve the event row (insert; unique constraint on event_id rejects duplicates).
 * 3. Dispatch handler. On success → status=processed. On failure → status=failed
 *    with error + retry_count++ so Stripe retries land back here cleanly.
 * 4. Duplicate event_id returns 200 without double-processing.
 */
async function handleWebhook(req: Request, env: StripeEnv) {
  const event: any = await verifyWebhook(req, env);
  const sb = getSupabase();

  // Reserve. If duplicate, return early.
  const { error: insertError } = await sb.from("payment_events").insert({
    event_id: event.id,
    event_type: event.type,
    provider: "stripe",
    environment: env,
    raw_payload: event,
    status: "processing",
  });

  if (insertError) {
    // 23505 = unique_violation — duplicate event_id.
    if ((insertError as any).code === "23505") {
      return { duplicate: true };
    }
    // Treat as ephemeral; let Stripe retry.
    throw new Error(`payment_events insert failed: ${insertError.message}`);
  }

  try {
    await dispatchEvent(event, env);
    await sb.from("payment_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("event_id", event.id);
    return { processed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Bump retry_count via separate read; service-role, no race risk for our volume.
    const { data: existing } = await sb.from("payment_events")
      .select("retry_count").eq("event_id", event.id).maybeSingle();
    await sb.from("payment_events")
      .update({
        status: "failed",
        error: message,
        retry_count: ((existing as any)?.retry_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", event.id);
    throw err;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[webhook] invalid env query parameter:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          const result = await handleWebhook(request, rawEnv);
          return Response.json({ received: true, ...result });
        } catch (e) {
          console.error("[webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});

// Exported for unit tests (Phase 12).
export const __test__ = { handleWebhook, dispatchEvent };
