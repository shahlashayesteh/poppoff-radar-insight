import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { Check, BarChart3, Users, Target, BookOpen } from "lucide-react";

const URL = "https://poppoffstats.com/demo/manager-dashboard";
const TITLE = "Manager Dashboard Demo — PoppOff";
const DESC = "A guided overview of the PoppOff manager dashboard — team scorecards, coaching priorities, and menu pairing suggestions for restaurant operators.";

export const Route = createFileRoute("/demo/manager-dashboard")({
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
          "@context": "https://schema.org", "@type": "WebPage",
          url: URL, name: TITLE, description: DESC,
          isPartOf: { "@id": "https://poppoffstats.com/#website" }, inLanguage: "en",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org", "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://poppoffstats.com/" },
            { "@type": "ListItem", position: 2, name: "Manager Dashboard Demo", item: URL },
          ],
        }),
      },
    ],
  }),
  component: Page,
});

function Page() {
  const blocks = [
    { i: BarChart3, t: "Team scorecards", d: "See per-server performance side by side — menu mix, weekly trend, and personal bests in one shared view." },
    { i: Target, t: "Coaching priorities", d: "Each week PoppOff highlights the servers and categories where coaching will move the numbers most." },
    { i: Users, t: "Leaderboards", d: "Shared scoreboards build friendly momentum — visibility, not pressure." },
    { i: BookOpen, t: "Menu pairing suggestions", d: "Practical pairing ideas tied to your menu, so coaching upselling stays specific and useful." },
  ];

  return (
    <div className="bg-white text-ink min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/"><Logo className="text-2xl" /></Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>See live demo</Link>
            <Link to="/contact" className="rounded-xl px-3 py-2 text-sm font-semibold border border-border hover:border-foreground">Contact</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 pt-14 pb-10">
          <div className="mx-auto max-w-4xl">
            <div className="text-xs uppercase tracking-widest text-brand-green font-bold">Manager dashboard demo</div>
            <h1 className="mt-3 font-display font-extrabold tracking-tight text-4xl md:text-5xl leading-[1.05]">
              What managers see in <span style={{ color: "var(--brand-green)" }}>PoppOff</span>.
            </h1>
            <p className="mt-6 text-base md:text-lg text-foreground/75 max-w-2xl">
              A guided look at the PoppOff manager dashboard — team scorecards, weekly coaching priorities, leaderboards, and menu pairing suggestions, all built on your POS data.
            </p>
          </div>
        </section>

        <section className="px-6 py-10 bg-canvas border-t border-border">
          <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-6">
            {blocks.map((b) => (
              <div key={b.t} className="rounded-2xl bg-white border border-border p-6">
                <div className="flex items-center gap-3">
                  <b.i className="h-6 w-6 text-brand-green" />
                  <div className="font-display text-xl font-extrabold">{b.t}</div>
                </div>
                <p className="mt-3 text-sm text-foreground/75">{b.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-14">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">What's inside</h2>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
              {["Team performance overview","Per-server scorecards","Weekly coaching priorities","Menu mix and category trends","Pairing suggestions per server","Estimated uplift across the venue"].map((f) => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-brand-green shrink-0" />{f}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>See the live demo</Link>
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
