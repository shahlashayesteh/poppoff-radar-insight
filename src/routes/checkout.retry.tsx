import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";

export const Route = createFileRoute("/checkout/retry")({
  component: CheckoutRetry,
  head: () => ({ meta: [{ title: "Complete your setup — PoppOff" }] }),
});

function CheckoutRetry() {
  const navigate = useNavigate();
  const [priceId, setPriceId] = useState<string>("");
  const [email, setEmail] = useState<string | undefined>();
  const [userId, setUserId] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/signin" }); return; }
      setEmail(data.user.email ?? undefined);
      setUserId(data.user.id);
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const stored = (meta.plan_price_id as string)
        || (typeof window !== "undefined" ? localStorage.getItem("poppoff_pending_price_id") : "")
        || "poppoff_starter_monthly";
      setPriceId(stored);
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", data.user.id).maybeSingle();
      setBusinessName(prof?.business_name || "");
      setReady(true);
    })();
  }, [navigate]);

  if (showCheckout && ready && priceId) {
    return (
      <div className="min-h-screen bg-canvas px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <Logo className="text-2xl justify-center" />
          <div className="mt-6 rounded-3xl bg-white border border-border p-4">
            <StripeEmbeddedCheckout priceId={priceId} customerEmail={email} userId={userId} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-6">
      <div className="max-w-md w-full rounded-3xl bg-white border border-border p-8 text-center">
        <Logo className="text-2xl justify-center" />
        <h1 className="mt-5 font-display text-2xl font-extrabold">Finish your subscription</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {businessName ? <>Start your 30‑day free trial for <b>{businessName}</b>.</> : "Start your 30‑day free trial."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">No charge today. Card required — we'll bill after 30 days. Cancel anytime.</p>
        <button
          disabled={!ready || !priceId}
          onClick={() => setShowCheckout(true)}
          className="mt-6 w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "var(--brand-orange)" }}
        >
          Start 30‑day free trial
        </button>
        <Link to="/" className="mt-4 inline-block text-xs text-muted-foreground">Back to home</Link>
      </div>
    </div>
  );
}
