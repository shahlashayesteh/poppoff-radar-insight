import { useEffect, useState } from "react";
import { toast } from "sonner";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.error("[paddle] checkout error:", detail);
      toast.error("Checkout error", {
        description: typeof detail === "string" ? detail : "See console for Paddle error details.",
      });
    };
    window.addEventListener("paddle:checkout-error", handler);
    return () => window.removeEventListener("paddle:checkout-error", handler);
  }, []);

  const openCheckout = async (options: {
    priceId: string;
    quantity?: number;
    customerEmail?: string;
    customData?: Record<string, string>;
    successUrl?: string;
  }) => {
    setLoading(true);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(options.priceId);
      console.log("[paddle] opening checkout", { externalId: options.priceId, paddlePriceId });

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: options.quantity ?? 1 }],
        customer: options.customerEmail
          ? { email: options.customerEmail, address: { countryCode: "GB" } }
          : { address: { countryCode: "GB" } },
        customData: options.customData,
        settings: {
          displayMode: "overlay",
          successUrl: options.successUrl || `${window.location.origin}/checkout/success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch (err: any) {
      console.error("[paddle] openCheckout failed", err);
      toast.error("Could not open checkout", { description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
