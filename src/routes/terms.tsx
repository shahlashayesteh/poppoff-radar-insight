import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — PoppOff" }, { name: "description", content: "PoppOff terms of service." }] }),
  component: Terms,
});

function Terms() {
  return (
    <div className="bg-white text-ink min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <Link to="/" className="text-sm font-semibold hover:text-brand-green">← Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: May 2026</p>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-foreground/80">
          <p>By using PoppOff you agree to these Terms. Please read them carefully.</p>
          <h2 className="font-bold text-base mt-6">Use of the service</h2>
          <p>PoppOff provides analytics and coaching tools for restaurant teams. You agree to use the service lawfully and not to misuse, reverse-engineer or disrupt it.</p>
          <h2 className="font-bold text-base mt-6">Accounts</h2>
          <p>You are responsible for maintaining the security of your account and for the activity that occurs under it.</p>
          <h2 className="font-bold text-base mt-6">Subscriptions and billing</h2>
          <p>Paid plans renew on the cycle selected at checkout. You can cancel at any time; cancellations take effect at the end of the current period.</p>
          <h2 className="font-bold text-base mt-6">Data ownership</h2>
          <p>You retain ownership of data you upload. We process it solely to provide the service as described in our Privacy Policy.</p>
          <h2 className="font-bold text-base mt-6">Disclaimer</h2>
          <p>The service is provided "as is" without warranties. To the extent permitted by law, PoppOff is not liable for indirect or consequential damages.</p>
          <h2 className="font-bold text-base mt-6">Contact</h2>
          <p>Questions? Email <a className="text-brand-green font-semibold" href="mailto:hello@poppoffstats.com">hello@poppoffstats.com</a>.</p>
        </div>
      </main>
    </div>
  );
}
