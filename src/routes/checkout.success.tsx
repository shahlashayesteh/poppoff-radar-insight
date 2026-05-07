import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { Logo } from "@/components/logo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({ meta: [{ title: "You're in — Popp Off" }] }),
  component: CheckoutSuccess,
});

function CheckoutSuccess() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ready" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) { setStatus("error"); setError("You're not signed in. Please sign in to access your dashboard."); }
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("business_name").eq("id", data.session.user.id).maybeSingle();
      const { error: rpcErr } = await supabase.rpc("claim_manager_account", {
        _business_name: profile?.business_name ?? "",
      });
      if (cancelled) return;
      if (rpcErr) { setStatus("error"); setError(rpcErr.message); return; }
      setStatus("ready");
    })();
    return () => { cancelled = true; };
  }, [navigate]);

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
          {status === "working" && "Setting up your venue…"}
          {status === "ready" && "Your venue is ready. Time to turn shifts into wins."}
          {status === "error" && (error ?? "Something went wrong.")}
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
