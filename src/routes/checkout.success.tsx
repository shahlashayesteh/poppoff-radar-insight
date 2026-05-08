import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Trophy } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({ meta: [{ title: "You're in — PoppOff" }] }),
  component: CheckoutSuccess,
  validateSearch: (search: Record<string, unknown>) => ({
    priceId: (search.priceId as string) || "",
  }),
});

function CheckoutSuccess() {
  const { priceId } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (priceId) {
      try {
        localStorage.setItem("poppoff_pending_price_id", priceId);
      } catch {}
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      // If already signed in with a manager role and venue, route to dashboard
      if (data.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);
        const isManager = roles?.some((r) => r.role === "manager");
        if (isManager) {
          navigate({ to: "/manager" });
          return;
        }
      }
      navigate({ to: "/signup/manager", search: { priceId: priceId || "" } });
    })();
    return () => { cancelled = true; };
  }, [priceId, navigate]);

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-6">
      <div className="max-w-md w-full rounded-3xl bg-white border border-border p-8 text-center">
        <Logo className="text-2xl justify-center" />
        <div className="mt-6 mx-auto h-20 w-20 rounded-full grid place-items-center"
          style={{ background: "color-mix(in oklab, var(--brand-green) 18%, white)" }}>
          <Trophy className="h-10 w-10 text-brand-green" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold">Payment received! 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Setting up your account...
        </p>
      </div>
    </div>
  );
}
