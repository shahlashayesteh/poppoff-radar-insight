import { useState } from "react";
import { precheckPaddle } from "@/lib/paddle";

export type OpenCheckoutResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (options: {
    priceId: string;
    quantity?: number;
    customerEmail?: string;
    customData?: Record<string, string>;
    successUrl?: string;
  }): Promise<OpenCheckoutResult> => {
    setLoading(true);
    try {
      const pre = await precheckPaddle(options.priceId);
      if (!pre.ok) return pre;

      try {
        window.Paddle.Checkout.open({
          items: [{ priceId: pre.paddlePriceId, quantity: options.quantity ?? 1 }],
          customer: options.customerEmail ? { email: options.customerEmail } : undefined,
          customData: options.customData,
          settings: {
            displayMode: "overlay",
            successUrl: options.successUrl || `${window.location.origin}/checkout/success`,
            allowLogout: false,
            variant: "one-page",
          },
        });
        // eslint-disable-next-line no-console
        console.info("[paddle] checkout opened", { priceId: options.priceId, paddlePriceId: pre.paddlePriceId });
        return { ok: true };
      } catch (e: any) {
        console.error("[paddle] Checkout.open threw", e);
        return { ok: false, code: "checkout_open_failed", message: e?.message || "Paddle rejected the checkout. The current domain may not be on the approved list in Paddle." };
      }
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
