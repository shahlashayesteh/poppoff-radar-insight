import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({ meta: [{ title: "You're in — Popp Off" }] }),
  component: CheckoutSuccess,
});

function CheckoutSuccess() {
  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-6">
      <div className="max-w-md w-full rounded-3xl bg-white border border-border p-8 text-center">
        <Logo className="text-2xl justify-center" />
        <div className="mt-6 mx-auto h-20 w-20 rounded-full grid place-items-center"
          style={{ background: "color-mix(in oklab, var(--brand-green) 18%, white)" }}>
          <Trophy className="h-10 w-10 text-brand-green" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold">You're in! 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your subscription is active. Time to turn shifts into wins.
        </p>
        <Link
          to="/manager"
          className="mt-6 inline-block rounded-xl px-6 py-3 text-sm font-bold text-white"
          style={{ background: "var(--brand-orange)" }}
        >
          Open your dashboard
        </Link>
      </div>
    </div>
  );
}
