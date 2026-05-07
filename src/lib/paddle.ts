import { resolvePaddlePrice } from "@/utils/payments.functions";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    Paddle: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;

export async function initializePaddle() {
  if (paddleInitialized) return;
  if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      const paddleJsEnvironment = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
      window.Paddle.Environment.set(paddleJsEnvironment);
      window.Paddle.Initialize({
        token: clientToken,
        eventCallback: (e: any) => {
          if (typeof e?.name === "string" && e.name.startsWith("checkout.")) {
            // eslint-disable-next-line no-console
            console.log("[paddle]", e.name, e.data);
            if (e.name === "checkout.error" || e.name === "checkout.payment.failed") {
              const detail =
                e?.data?.error?.detail ||
                e?.data?.error?.message ||
                e?.data?.error?.code ||
                JSON.stringify(e?.data?.error || e?.data || {});
              window.dispatchEvent(new CustomEvent("paddle:checkout-error", { detail }));
            }
          }
        },
      });
      paddleInitialized = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  const environment = getPaddleEnvironment();
  return resolvePaddlePrice({ data: { priceId, environment } });
}
