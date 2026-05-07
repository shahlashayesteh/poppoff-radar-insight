import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/checkout/start")({
  validateSearch: (s: Record<string, unknown>): { priceId?: string } => ({
    priceId: typeof s.priceId === "string" ? s.priceId : undefined,
  }),
  component: CheckoutStart,
});

function CheckoutStart() {
  const { priceId } = useSearch({ from: "/checkout/start" });
  const { user, loading } = useAuth();
  const { openCheckout } = usePaddleCheckout();
  const navigate = useNavigate();
  const fired = useRef(false);

  useEffect(() => {
    if (loading || fired.current) return;
    if (!user) {
      navigate({ to: "/signup/manager", search: { priceId } });
      return;
    }
    if (!priceId) {
      navigate({ to: "/" });
      return;
    }
    fired.current = true;
    openCheckout({
      priceId,
      customerEmail: user.email,
      customData: { userId: user.id },
    });
  }, [loading, user, priceId, openCheckout, navigate]);

  return (
    <div className="min-h-screen bg-white grid place-items-center px-6">
      <div className="text-center">
        <Logo className="text-2xl justify-center" />
        <p className="mt-6 text-sm text-muted-foreground">Opening checkout…</p>
      </div>
    </div>
  );
}
