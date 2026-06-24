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
      try {
        const paddleJsEnvironment = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
        window.Paddle.Environment.set(paddleJsEnvironment);
        window.Paddle.Initialize({ token: clientToken });
        paddleInitialized = true;
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("Failed to load Paddle.js"));
    document.head.appendChild(script);
  });
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  const environment = getPaddleEnvironment();
  return resolvePaddlePrice({ data: { priceId, environment } });
}

export type PaddlePrecheckResult =
  | { ok: true; paddlePriceId: string; environment: "sandbox" | "live" }
  | { ok: false; code: "no_token" | "paddle_load_failed" | "price_not_found" | "unknown"; message: string };

/**
 * Pre-flight check before opening Paddle checkout.
 * - Verifies the client token is set
 * - Initializes Paddle.js (or reports load failure)
 * - Resolves the human-readable priceId to a Paddle internal price ID
 * Returns a typed result with an actionable message — never throws.
 */
export async function precheckPaddle(priceId: string): Promise<PaddlePrecheckResult> {
  const environment = getPaddleEnvironment();
  // eslint-disable-next-line no-console
  console.info("[paddle] precheck start", {
    env: environment,
    tokenPrefix: clientToken ? clientToken.slice(0, 5) : null,
    origin: typeof window !== "undefined" ? window.location.origin : null,
    priceId,
  });

  if (!clientToken || !(clientToken.startsWith("test_") || clientToken.startsWith("live_"))) {
    return { ok: false, code: "no_token", message: "Payments aren't configured (missing client token)." };
  }
  if (!priceId) {
    return { ok: false, code: "price_not_found", message: "No plan selected." };
  }

  try {
    await initializePaddle();
    if (typeof window === "undefined" || !window.Paddle?.Checkout?.open) {
      return { ok: false, code: "paddle_load_failed", message: "Couldn't load Paddle. Check your network or disable ad-blockers and retry." };
    }
  } catch (e) {
    console.error("[paddle] init failed", e);
    return { ok: false, code: "paddle_load_failed", message: "Couldn't load Paddle. Check your network or disable ad-blockers and retry." };
  }

  let paddlePriceId: string;
  try {
    paddlePriceId = await resolvePaddlePrice({ data: { priceId, environment } });
  } catch (e: any) {
    console.error("[paddle] price resolve failed", e);
    return { ok: false, code: "price_not_found", message: `Price not found in ${environment}: ${priceId}` };
  }
  if (!paddlePriceId) {
    return { ok: false, code: "price_not_found", message: `Price not found in ${environment}: ${priceId}` };
  }

  console.info("[paddle] precheck ok", { paddlePriceId, environment });
  return { ok: true, paddlePriceId, environment };
}
