import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { Loader2, CheckCircle2, ShieldCheck, BarChart3, Users } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Book a Revenue Gap Audit — PoppOff" },
      { name: "description", content: "Book a free Revenue Gap Audit with PoppOff. We turn your POS data into a clear picture of where revenue is leaking across servers, shifts, and venues — and what to do about it." },
      { property: "og:title", content: "Book a Revenue Gap Audit — PoppOff" },
      { property: "og:description", content: "Book a free Revenue Gap Audit with PoppOff. POS data in, revenue gaps out — quantified by server, shift, and venue." },
      { property: "og:url", content: "https://poppoffstats.com/contact" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Book a Revenue Gap Audit — PoppOff" },
      { name: "twitter:description", content: "Free audit. We quantify the revenue gap hiding in your POS data and show you how to close it." },
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
          name: "Book a Revenue Gap Audit",
          url: "https://poppoffstats.com/contact",
          description:
            "Book a free Revenue Gap Audit with the PoppOff team for restaurants and hospitality groups.",
          mainEntity: {
            "@type": "Organization",
            name: "PoppOff",
            url: "https://poppoffstats.com",
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
            { "@type": "ListItem", position: 2, name: "Book a Revenue Gap Audit", item: "https://poppoffstats.com/contact" },
          ],
        }),
      },
    ],
  }),
  component: ContactPage,
});

const VENUE_OPTIONS = ["1", "2–3", "4–9", "10–24", "25+"];
const REVENUE_OPTIONS = [
  "Under £50k / month",
  "£50k–£150k / month",
  "£150k–£500k / month",
  "£500k–£1.5m / month",
  "£1.5m+ / month",
  "Prefer not to say",
];
const ROLE_OPTIONS = [
  "Owner / Founder",
  "CEO / MD",
  "CFO / Finance",
  "Operations Director",
  "Multi-site / Area Manager",
  "General Manager",
  "Other",
];

function ContactPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [venueCount, setVenueCount] = useState("");
  const [monthlyRevenueBand, setMonthlyRevenueBand] = useState("");
  const [currentPos, setCurrentPos] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [auditGoal, setAuditGoal] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedAt = useRef<number>(Date.now());
  useEffect(() => { mountedAt.current = Date.now(); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please complete name, email, and what you'd like to fix.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, restaurant, email, message,
          role, venueCount, monthlyRevenueBand, currentPos, phone,
          auditGoal: auditGoal || message,
          source: "revenue-gap-audit",
          website,
          elapsedMs: Date.now() - mountedAt.current,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Could not send your message. Please try again.");
      }
      setSent(true);
      setName(""); setRole(""); setRestaurant(""); setVenueCount("");
      setMonthlyRevenueBand(""); setCurrentPos(""); setEmail(""); setPhone("");
      setAuditGoal(""); setMessage("");
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
            <Link to="/contact" className="hover:text-brand-green text-brand-green">Book audit</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/signin" className="rounded-xl px-3 py-2 text-sm font-semibold border border-border hover:border-foreground">Sign in</Link>
            <Link to="/signup" className="rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-green)" }}>Sign up</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-5xl grid lg:grid-cols-[1.1fr_1fr] gap-12">
          <div>
            <div className="text-xs uppercase tracking-widest text-brand-green font-bold">Free audit</div>
            <h1 className="mt-2 font-display text-4xl md:text-5xl font-extrabold tracking-tight">
              Book a Revenue Gap Audit
            </h1>
            <p className="mt-4 text-base md:text-lg text-foreground/75">
              The revenue gap is the difference between what your venue earns today and what it would earn if every server performed at the level of your top quartile. PoppOff quantifies that gap from your existing POS data — by server, by shift, by category, by venue — and shows exactly where to close it.
            </p>
            <ul className="mt-8 space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <BarChart3 className="h-5 w-5 text-brand-green shrink-0 mt-0.5" />
                <span><strong>POS data in.</strong> We map your existing exports — no integration required to start.</span>
              </li>
              <li className="flex items-start gap-3">
                <Users className="h-5 w-5 text-brand-orange shrink-0 mt-0.5" />
                <span><strong>Revenue gap out.</strong> A quantified, per-server, per-venue view of where revenue is leaking.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-brand-green shrink-0 mt-0.5" />
                <span><strong>Free and confidential.</strong> Audit findings are yours whether you become a customer or not.</span>
              </li>
            </ul>
            <p className="mt-8 text-xs text-foreground/60">
              Use the form on this page and we'll reply within one business day.
            </p>

          </div>

          <div className="rounded-2xl border border-border bg-white p-6 md:p-8 shadow-sm">
            {sent ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                <div>
                  <div className="font-display text-xl font-extrabold">Audit request received</div>
                  <p className="mt-2 text-sm text-foreground/75">
                    Thanks — a member of the PoppOff team will reach out within one business day to schedule your Revenue Gap Audit.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-4 text-sm font-semibold text-brand-green hover:underline"
                  >
                    Submit another request
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                {/* Honeypot — visually hidden, off-screen, ignored by humans. */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                  <label htmlFor="website">Website (leave blank)</label>
                  <input id="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold mb-1.5">Name *</label>
                    <input id="name" type="text" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground" placeholder="Your full name" />
                  </div>
                  <div>
                    <label htmlFor="role" className="block text-sm font-semibold mb-1.5">Role</label>
                    <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-foreground">
                      <option value="">Select…</option>
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold mb-1.5">Work email *</label>
                    <input id="email" type="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground" placeholder="you@yourrestaurant.com" />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold mb-1.5">Phone (optional)</label>
                    <input id="phone" type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground" placeholder="+44 …" />
                  </div>
                </div>

                <div>
                  <label htmlFor="restaurant" className="block text-sm font-semibold mb-1.5">Restaurant or group name</label>
                  <input id="restaurant" type="text" maxLength={150} value={restaurant} onChange={(e) => setRestaurant(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground" placeholder="e.g. The Sample Group" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="venueCount" className="block text-sm font-semibold mb-1.5">Number of venues</label>
                    <select id="venueCount" value={venueCount} onChange={(e) => setVenueCount(e.target.value)} className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-foreground">
                      <option value="">Select…</option>
                      {VENUE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="monthlyRevenueBand" className="block text-sm font-semibold mb-1.5">Group revenue / month</label>
                    <select id="monthlyRevenueBand" value={monthlyRevenueBand} onChange={(e) => setMonthlyRevenueBand(e.target.value)} className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-foreground">
                      <option value="">Select…</option>
                      {REVENUE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="currentPos" className="block text-sm font-semibold mb-1.5">Current POS system</label>
                  <input id="currentPos" type="text" maxLength={100} value={currentPos} onChange={(e) => setCurrentPos(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground" placeholder="e.g. Toast, Lightspeed, Square, Zonal, Oracle Simphony" />
                </div>

                <div>
                  <label htmlFor="auditGoal" className="block text-sm font-semibold mb-1.5">What would you most like the audit to answer?</label>
                  <textarea id="auditGoal" maxLength={2000} rows={3} value={auditGoal} onChange={(e) => setAuditGoal(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground resize-y" placeholder="e.g. Why is wine attach 18% vs 32% across our 6 sites? Where is the biggest uplift hiding?" />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-semibold mb-1.5">Anything else we should know *</label>
                  <textarea id="message" required maxLength={4000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-foreground resize-y" placeholder="Context on your team, current systems, or timing." />
                </div>

                {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white disabled:opacity-60 w-full sm:w-auto"
                  style={{ background: "var(--brand-orange)" }}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Sending…" : "Book my Revenue Gap Audit"}
                </button>
                <p className="text-[11px] text-foreground/55">
                  By submitting you agree to PoppOff contacting you about your audit. We do not share your data.
                </p>
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
