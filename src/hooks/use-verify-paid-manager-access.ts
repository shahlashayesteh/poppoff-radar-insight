// Phase 14 — Client hook that calls the server-side entitlement verifier
// once on mount. Combined with the UI PaidManagerGate and RLS, this gives
// us network-boundary enforcement: even if the client gate is bypassed,
// the server fn refuses to return data for cancelled/expired/unknown users
// and past_due users beyond the 7-day grace window.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyPaidManagerAccess } from "@/lib/manager-data.functions";

export type VerifyState = "idle" | "ok" | "blocked";

export function useVerifyPaidManagerAccess(): {
  state: VerifyState;
  error: string | null;
} {
  const [state, setState] = useState<VerifyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const verify = useServerFn(verifyPaidManagerAccess);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await verify();
        if (!cancelled) {
          setState("ok");
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setState("blocked");
          setError(e?.message ?? "Subscription required");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [verify]);

  return { state, error };
}
