import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { Check } from "lucide-react";

const URL = "https://poppoffstats.com/restaurant-server-performance-software";
const TITLE = "Restaurant Server Performance Software — PoppOff";
const DESC = "PoppOff is restaurant server performance software that turns POS sales data into per-server scorecards, weekly coaching priorities, and shared visibility for managers and servers.";

export const Route = createFileRoute("/restaurant-server-performance-software")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: URL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          url: URL,
          name: TITLE,
          description: DESC,
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
            { "@type": "ListItem", position: 2, name: "Restaurant Server Performance Software", item: URL },
          ],
        }),
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="bg-white text-ink min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>See Demo</Link>
            <Link to="/contact" className="rounded-xl px-3 py-2 text-sm font-semibold border border-border hover:border-foreground">Contact</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 pt-14 pb-12">
          <div className="mx-auto max-w-4xl">
            <div className="text-xs uppercase tracking-widest text-brand-green font-bold">Restaurant server performance software</div>
            <h1 className="mt-3 font-display font-extrabold tracking-tight text-4xl md:text-6xl leading-[1.05]">
              Make server performance <span style={{ color: "var(--brand-green)" }}>visible</span> across your restaurant.
            </h1>
            <p className="mt-6 text-base md:text-lg text-foreground/75 max-w-2xl">
              PoppOff turns POS sales data into per-server scorecards, weekly coaching priorities, and clear targets — so managers and servers work from the same numbers, every shift.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>See Demo</Link>
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold border-2 border-foreground">Start Your Pilot</Link>
            </div>
          </div>
        </section>

        <section className="px-6 py-12 bg-canvas border-t border-border">
          <div className="mx-auto max-w-6xl grid md:grid-cols-3 gap-6">
            {[
              { t: "Server performance tracking", d: "Personal scorecards turn POS data into a clear view of how each server is performing week to week." },
              { t: "Coaching consistency", d: "Managers run a steady weekly cadence built on the same numbers their team can see." },
              { t: "Operational clarity", d: "Shared visibility into menu mix, streaks, and weekly focus areas — built for restaurant staff performance management." },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl bg-white border border-border p-6">
                <div className="font-display text-xl font-extrabold">{f.t}</div>
                <p className="mt-2 text-sm text-foreground/75">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="text-xs uppercase tracking-widest text-brand-green font-bold">How it works</div>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold tracking-tight">Sales data in. Wins out.</h2>
            <ol className="mt-8 grid md:grid-cols-5 gap-4">
              {[
                "Manager uploads weekly sales data.",
                "Managers simply track performance, engagement, and estimated uplift.",
                "PoppOff creates personal scorecards.",
                "Servers see their weekly focus.",
                "Managers see coaching priorities and uplift.",
              ].map((step, i) => (
                <li key={i} className="rounded-2xl bg-white border border-border p-5">
                  <div className="font-display text-3xl font-extrabold" style={{ color: i % 2 ? "var(--brand-orange)" : "var(--brand-green)" }}>0{i + 1}</div>
                  <p className="mt-3 text-sm">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-6 py-12 bg-canvas border-t border-border">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">Built for restaurants and hospitality groups</h2>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
              {[
                "Per-server scorecards from POS data",
                "Weekly coaching priorities for managers",
                "Menu mix and category visibility",
                "Streaks, milestones, and personal bests",
                "Shared scoreboards for friendly team momentum",
                "Manager view of coaching consistency and uplift",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-brand-green shrink-0" />{f}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>See Demo</Link>
              <Link to="/contact" className="rounded-xl px-6 py-3 text-sm font-bold border-2 border-foreground">Talk to us</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-10 border-t border-border text-sm bg-white">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo />
            <span className="text-muted-foreground">© 2026 PoppOff. All rights reserved.</span>
          </div>
          <nav className="flex items-center gap-6 text-muted-foreground">
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
