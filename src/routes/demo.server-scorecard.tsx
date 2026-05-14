import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { Check, Trophy, Award, Target, BarChart3 } from "lucide-react";

const URL = "https://poppoffstats.com/demo/server-scorecard";
const TITLE = "Server Scorecard Demo — PoppOff";
const DESC = "A guided overview of the PoppOff server scorecard — personal stats, streaks, milestones, and weekly focus areas built on POS data.";

export const Route = createFileRoute("/demo/server-scorecard")({
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
            { "@type": "ListItem", position: 2, name: "Server Scorecard Demo", item: URL },
          ],
        }),
      },
    ],
  }),
  component: Page,
});

function Page() {
  const blocks = [
    { i: BarChart3, t: "Personal scorecard", d: "Each server gets a personal view of their menu mix, weekly trend, and where they stand against their own best weeks." },
    { i: Trophy, t: "Streaks and personal bests", d: "Daily and weekly streaks plus personal bests turn each shift into a small, visible win." },
    { i: Award, t: "Milestones and rewards", d: "Servers see clear milestones to chase next — bragging rights for hitting them, not penalties for missing." },
    { i: Target, t: "Weekly focus", d: "A specific category to grow next week — informed by menu mix, not guesswork." },
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
            <div className="text-xs uppercase tracking-widest text-brand-green font-bold">Server scorecard demo</div>
            <h1 className="mt-3 font-display font-extrabold tracking-tight text-4xl md:text-5xl leading-[1.05]">
              What servers see in <span style={{ color: "var(--brand-orange)" }}>PoppOff</span>.
            </h1>
            <p className="mt-6 text-base md:text-lg text-foreground/75 max-w-2xl">
              A guided look at the PoppOff server scorecard — personal stats, streaks, milestones, and a weekly focus that turns POS data into momentum on the floor.
            </p>
          </div>
        </section>

        <section className="px-6 py-10 bg-canvas border-t border-border">
          <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-6">
            {blocks.map((b) => (
              <div key={b.t} className="rounded-2xl bg-white border border-border p-6">
                <div className="flex items-center gap-3">
                  <b.i className="h-6 w-6 text-brand-orange" />
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
              {["Personal scorecard","Daily and weekly streaks","Personal bests","Menu mix breakdown","Milestones and rewards","Shared scoreboard placement"].map((f) => (
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
