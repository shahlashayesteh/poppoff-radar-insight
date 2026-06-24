import { useEffect, useState } from "react";
import { getPaddleEnvironment, initializePaddle, precheckPaddle } from "@/lib/paddle";

type CheckState = "pending" | "ok" | "fail";
type PriceCheck = { priceId: string; state: CheckState; paddlePriceId?: string; message?: string };

export interface PaddleDebugStatus {
  ready: boolean;
  tokenOk: boolean;
  sdkOk: boolean;
  pricesOk: boolean;
}

export function PaddleDebugPanel({
  priceIds,
  onStatusChange,
}: {
  priceIds: string[];
  onStatusChange?: (status: PaddleDebugStatus) => void;
}) {
  const token = (import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined) ?? "";
  const env = getPaddleEnvironment();

  const tokenOk = !!token && (token.startsWith("test_") || token.startsWith("live_"));
  const [sdk, setSdk] = useState<CheckState>("pending");
  const [prices, setPrices] = useState<PriceCheck[]>(
    priceIds.map((p) => ({ priceId: p, state: "pending" })),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenOk) {
        setSdk("fail");
        return;
      }
      try {
        await initializePaddle();
        if (cancelled) return;
        setSdk(typeof window !== "undefined" && window.Paddle?.Checkout?.open ? "ok" : "fail");
      } catch {
        if (!cancelled) setSdk("fail");
      }

      const results = await Promise.all(
        priceIds.map(async (priceId): Promise<PriceCheck> => {
          const r = await precheckPaddle(priceId);
          if (r.ok) return { priceId, state: "ok", paddlePriceId: r.paddlePriceId };
          return { priceId, state: "fail", message: r.message };
        }),
      );
      if (!cancelled) setPrices(results);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceIds.join("|")]);

  const pricesOk = prices.length > 0 && prices.every((p) => p.state === "ok");
  const ready = tokenOk && sdk === "ok" && pricesOk;

  useEffect(() => {
    onStatusChange?.({ ready, tokenOk, sdkOk: sdk === "ok", pricesOk });
  }, [ready, tokenOk, sdk, pricesOk, onStatusChange]);

  const Dot = ({ s }: { s: CheckState }) => (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        s === "ok" ? "bg-green-500" : s === "fail" ? "bg-red-500" : "bg-amber-400 animate-pulse"
      }`}
    />
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-3xl mb-8 rounded-xl border-2 border-border bg-white/80 p-4 text-left text-xs font-mono"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm font-sans">Paddle checkout status</div>
        <span
          className={`text-[11px] font-sans font-bold px-2 py-0.5 rounded-full ${
            ready ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {ready ? "Ready" : "Checking…"}
        </span>
      </div>

      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <Dot s={tokenOk ? "ok" : "fail"} />
          <span>
            Client token: {tokenOk ? `${token.slice(0, 5)}… (${env})` : "missing or invalid"}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Dot s={sdk} />
          <span>Paddle.js SDK: {sdk === "ok" ? "loaded" : sdk === "fail" ? "failed to load" : "loading…"}</span>
        </li>
        {prices.map((p) => (
          <li key={p.priceId} className="flex items-start gap-2">
            <span className="mt-1"><Dot s={p.state} /></span>
            <span className="break-all">
              <span className="font-sans font-semibold">{p.priceId}</span>{" "}
              →{" "}
              {p.state === "ok"
                ? p.paddlePriceId
                : p.state === "fail"
                  ? p.message ?? "failed"
                  : "resolving…"}
            </span>
          </li>
        ))}
      </ul>

      {!ready && (
        <p className="mt-3 text-[11px] font-sans text-muted-foreground">
          Get Started is disabled until all checks pass.
        </p>
      )}
    </div>
  );
}
