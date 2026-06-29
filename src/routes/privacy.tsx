import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PoppOff" },
      { name: "description", content: "How PoppOff collects, uses, and protects data from restaurants and their teams." },
      { property: "og:title", content: "Privacy Policy — PoppOff" },
      { property: "og:description", content: "How PoppOff collects, uses, and protects data from restaurants and their teams." },
      { property: "og:url", content: "https://poppoffstats.com/privacy" },
    ],
    links: [
      { rel: "canonical", href: "https://poppoffstats.com/privacy" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          url: "https://poppoffstats.com/privacy",
          name: "Privacy Policy — PoppOff",
          description: "How PoppOff collects, uses, and protects data from restaurants and their teams.",
          isPartOf: { "@id": "https://poppoffstats.com/#website" },
          inLanguage: "en",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://poppoffstats.com/" },
            { "@type": "ListItem", position: 2, name: "Privacy Policy", item: "https://poppoffstats.com/privacy" },
          ],
        }),
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="bg-white text-ink min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <Link to="/" className="text-sm font-semibold hover:text-brand-green">← Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 prose prose-sm">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: May 2026</p>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-foreground/80">
          <p>This Privacy Policy describes how PoppOff ("we", "us") collects, uses and protects information when you use our service.</p>
          <h2 className="font-bold text-base mt-6">Information we collect</h2>
          <p>Account details (name, email), venue and sales data uploaded by managers, and usage data needed to operate the service.</p>
          <h2 className="font-bold text-base mt-6">How we use information</h2>
          <p>To provide scorecards, coaching and reporting features; to maintain and secure the service; and to communicate with you about your account.</p>
          <h2 className="font-bold text-base mt-6">Sharing</h2>
          <p>We do not sell personal information. We share data only with service providers needed to run PoppOff, and where required by law.</p>
          <h2 className="font-bold text-base mt-6">Your rights</h2>
          <p>You may request access, correction or deletion of your data at any time via our <a className="text-brand-green font-semibold" href="/contact">contact form</a>.</p>
          <h2 className="font-bold text-base mt-6">Contact</h2>
          <p>Questions about this policy? Reach us via our <a className="text-brand-green font-semibold" href="/contact">contact form</a>.</p>

        </div>
      </main>
    </div>
  );
}
