import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

export const Route = createFileRoute("/checkout/retry")({
  component: CheckoutRetry,
  head: () => ({ meta: [{ title: "Complete your setup — PoppOff" }] }),
});

function CheckoutRetry() {
  const navigate = useNavigate();
  const { openCheckout, loading } = usePaddleCheckout();
  const [priceId, setPriceId] = useState<string>("");
  const [email, setEmail] = useState<string | undefined>();
  const [businessName, setBusinessName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/signin" }); return; }
      setEmail(data.user.email ?? undefined);
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const stored = (meta.plan_price_id as string) || (typeof window !== "undefined" ? localStorage.getItem("poppoff_pending_price_id") : "") || "poppoff_starter_monthly";
      setPriceId(stored);
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", data.user.id).maybeSingle();
      setBusinessName(prof?.business_name || "");
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-6">
      <div className="max-w-md w-full rounded-3xl bg-white border border-border p-8 text-center">
        <Logo className="text-2xl justify-center" />
        <h1 className="mt-5 font-display text-2xl font-extrabold">Finish your subscription</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {businessName ? <>Complete payment to activate <b>{businessName}</b>.</> : "Complete payment to activate your venue."}
        </p>
        <button
          disabled={loading || !priceId}
          onClick={() => openCheckout({ priceId, customerEmail: email, successUrl: `${window.location.origin}/checkout/success?priceId=${encodeURIComponent(priceId)}` })}
          className="mt-6 w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "var(--brand-orange)" }}
        >
          {loading ? "Opening…" : "Complete payment"}
        </button>
        <Link to="/" className="mt-4 inline-block text-xs text-muted-foreground">Back to home</Link>
      </div>
    </div>
  );
}
