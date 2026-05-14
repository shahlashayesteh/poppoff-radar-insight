import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact PoppOff — Get in touch" },
      { name: "description", content: "Have a question or want to speak to the PoppOff team? Send us a message and we'll get back to you shortly." },
      { property: "og:title", content: "Contact PoppOff" },
      { property: "og:description", content: "Speak to the PoppOff team about server performance, coaching, and pricing for your restaurant or hospitality group." },
      { property: "og:url", content: "https://poppoffstats.com/contact" },
      { name: "twitter:title", content: "Contact PoppOff" },
      { name: "twitter:description", content: "Speak to the PoppOff team about server performance, coaching, and pricing for your restaurant or hospitality group." },
    ],
    links: [
      { rel: "canonical", href: "https://poppoffstats.com/contact" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact PoppOff",
          url: "https://poppoffstats.com/contact",
          description:
            "Contact the PoppOff team about server performance analytics and coaching for restaurants and hospitality groups.",
          mainEntity: {
            "@type": "Organization",
            name: "PoppOff",
            url: "https://poppoffstats.com",
            email: "hello@poppoffstats.com",
            contactPoint: [
              {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: "hello@poppoffstats.com",
                availableLanguage: ["en"],
              },
            ],
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://poppoffstats.com/" },
            { "@type": "ListItem", position: 2, name: "Contact", item: "https://poppoffstats.com/contact" },
          ],
        }),
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, restaurant, email, message }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Could not send your message. Please try again.");
      }
      setSent(true);
      setName(""); setRestaurant(""); setEmail(""); setMessage("");
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white text-ink min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link to="/" className="hover:text-brand-green">Home</Link>
            <Link to="/" hash="how" className="hover:text-brand-green">How it works</Link>
            <Link to="/" hash="pricing" className="hover:text-brand-green">Pricing</Link>
            <Link to="/contact" className="hover:text-brand-green text-brand-green">Contact</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/signin" className="rounded-xl px-3 py-2 text-sm font-semibold border border-border hover:border-foreground">Sign in</Link>
            <Link to="/signup" className="rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-green)" }}>Sign up</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-green font-bold">Contact</div>
          <h1 className="mt-2 font-display text-4xl md:text-5xl font-extrabold tracking-tight">Contact PoppOff</h1>
          <p className="mt-4 text-base md:text-lg text-foreground/75 max-w-xl">
            Have a question or want to speak to the PoppOff team? Send us a message and we'll get back to you shortly.
          </p>

          <a
            href="mailto:hello@poppoffstats.com"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-foreground"
          >
            <Mail className="h-4 w-4 text-brand-orange" />
            hello@poppoffstats.com
          </a>

          <div className="mt-10 rounded-2xl border border-border bg-white p-6 md:p-8 shadow-sm">
            {sent ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                <div>
                  <div className="font-display text-xl font-extrabold">Message received</div>
                  <p className="mt-2 text-sm text-foreground/75">
                    Thanks, your message has been received. We'll get back to you shortly.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-4 text-sm font-semibold text-brand-green hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold mb-1.5">Name</label>
                  <input
                    id="name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label htmlFor="restaurant" className="block text-sm font-semibold mb-1.5">Restaurant or group name</label>
                  <input
                    id="restaurant"
                    type="text"
                    maxLength={150}
                    value={restaurant}
                    onChange={(e) => setRestaurant(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground"
                    placeholder="e.g. The Sample Bistro"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold mb-1.5">Email address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    maxLength={255}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground"
                    placeholder="you@yourrestaurant.com"
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-semibold mb-1.5">Message</label>
                  <textarea
                    id="message"
                    required
                    maxLength={4000}
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground resize-y"
                    placeholder="How can we help?"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: "var(--brand-orange)" }}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Sending…" : "Send Message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PoppOff. All rights reserved.
      </footer>
    </div>
  );
}
