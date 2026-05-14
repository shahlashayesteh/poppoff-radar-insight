import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { Trophy, Award, Check, ShieldCheck, BarChart3, Users, BookOpen, Target } from "lucide-react";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PoppOff — Every shift. Every win." },
      { name: "description", content: "Personal stats, streaks, and milestones for restaurant servers. Turn your numbers into momentum and more money in your pocket." },
      { property: "og:title", content: "PoppOff — Every shift. Every win." },
      { property: "og:description", content: "Personal stats, streaks, and milestones for restaurant servers." },
      { property: "og:url", content: "https://poppoffstats.com/" },
      { name: "twitter:title", content: "PoppOff — Every shift. Every win." },
      { name: "twitter:description", content: "Personal stats, streaks, and milestones for restaurant servers." },
    ],
    links: [
      { rel: "canonical", href: "https://poppoffstats.com/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": "https://poppoffstats.com/#webpage",
          url: "https://poppoffstats.com/",
          name: "PoppOff — Every shift. Every win.",
          description: "Personal scorecards, weekly coaching priorities, and menu intelligence for restaurants and hospitality groups.",
          isPartOf: { "@id": "https://poppoffstats.com/#website" },
          about: { "@id": "https://poppoffstats.com/#organization" },
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
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is restaurant server performance software?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Restaurant server performance software turns POS sales data into per-server scorecards so operators have shared visibility into how each server is performing. PoppOff focuses on server performance tracking and restaurant staff performance management — giving managers and servers the same numbers to coach against, week after week.",
              },
            },
            {
              "@type": "Question",
              name: "How does PoppOff work?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Managers upload weekly POS sales data. PoppOff turns it into personal scorecards for each server, surfaces a weekly focus area, and gives managers coaching priorities and estimated uplift across the venue. The flow is: sales data in, personal scorecards out, weekly coaching priorities for the team.",
              },
            },
            {
              "@type": "Question",
              name: "Can restaurant servers see their own performance?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Every server gets a personal scorecard showing their menu mix, streaks, milestones, and how they compare to their own best weeks. The goal is visibility — servers know where they stand and what to work on next.",
              },
            },
            {
              "@type": "Question",
              name: "Does PoppOff use POS sales data?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. PoppOff is built around the sales data restaurants already capture in their POS. Managers upload weekly sales data and PoppOff transforms it into scorecards, coaching priorities, and menu mix insights.",
              },
            },
            {
              "@type": "Question",
              name: "How does PoppOff help restaurants improve sales?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "PoppOff makes performance visible at the server and team level, then turns that visibility into restaurant coaching priorities and menu pairing suggestions. Managers focus their coaching where it will move the numbers most, and servers see exactly which categories — wine, cocktails, desserts — to grow next.",
              },
            },
            {
              "@type": "Question",
              name: "How can managers keep restaurant teams accountable?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "PoppOff supports restaurant employee accountability by giving managers and servers a shared, transparent view of the same performance numbers. It is designed for visibility, coaching consistency, and operational clarity — not monitoring. Managers run a steady weekly cadence built on the same scorecards their team can see.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[36px] border-[10px] border-foreground bg-white shadow-2xl overflow-hidden w-[260px] shrink-0">
      <div className="h-5 bg-foreground rounded-b-2xl mx-auto w-24 -mt-1" />
      <div className="p-3 text-[11px]">{children}</div>
    </div>
  );
}

function Landing() {
  const { openCheckout, loading } = usePaddleCheckout();
  return (
    <div className="bg-white text-ink">
      <PaymentTestModeBanner />

      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Logo className="text-2xl" />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#" className="hover:text-brand-green">Home</a>
            <a href="#how" className="hover:text-brand-green">How it works</a>
            <a href="#pricing" className="hover:text-brand-green">Pricing</a>
            <a href="#about" className="hover:text-brand-green">About</a>
            <Link to="/contact" className="hover:text-brand-green">Contact</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/signin" className="rounded-xl px-3 py-2 text-sm font-semibold border border-border hover:border-foreground">Sign in</Link>
            <Link to="/signup" className="rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-green)" }}>Sign up</Link>
            <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-white hidden sm:inline-flex" style={{ background: "var(--brand-orange)" }}>See Demo</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-14 pb-20">
        <div className="mx-auto max-w-7xl grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="font-display font-extrabold tracking-tight text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.02]">
              <span className="block">PoppOff</span>
              <span className="block">makes <span style={{ color: "var(--foreground)" }}>server performance</span> <span style={{ color: "var(--brand-green)" }}>visible</span>.</span>
            </h1>
            <p className="mt-6 text-base md:text-lg text-foreground/75 max-w-xl">
              PoppOff turns POS data into server scorecards, coaching insights, and clear targets so every shift becomes more visible, more focused, and more profitable.
            </p>
            <div className="mt-6 font-display font-extrabold tracking-tight text-lg md:text-xl leading-snug">
              <div style={{ color: "var(--brand-green)" }}>Visibility changes behaviour.</div>
              <div style={{ color: "var(--brand-orange)" }}>Behaviour improves performance.</div>
              <div style={{ color: "var(--brand-green)" }}>Performance increases revenue.</div>
            </div>
            <div className="mt-6 inline-flex items-center gap-3 rounded-xl border-l-4 pl-4 py-1" style={{ borderColor: "var(--brand-orange)" }}>
              <p className="font-display text-lg md:text-xl font-extrabold tracking-tight">
                PoppOff <span style={{ color: "var(--brand-orange)" }}>every shift.</span> Every win.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold text-white inline-flex items-center gap-2" style={{ background: "var(--brand-orange)" }}>
                See Demo
              </Link>
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold border-2 border-foreground inline-flex items-center gap-2">
                Start Your Pilot
              </Link>
            </div>
            <p className="mt-6 text-sm text-foreground/70 max-w-md">
              Designed to help servers improve performance — turning sales data into coaching, motivation, and revenue growth.
            </p>
          </div>

          {/* Phone mockups */}
          <div className="flex gap-4 justify-center overflow-hidden lg:overflow-visible">
            <PhoneFrame>
              <div className="text-center">
                <div className="text-brand-orange font-bold text-xs">🔥 Current streak</div>
                <div className="my-3 mx-auto h-24 w-24 rounded-full grid place-items-center" style={{ background: "color-mix(in oklab, var(--brand-orange) 18%, white)" }}>
                  <div className="font-display text-4xl font-extrabold text-brand-orange">12</div>
                </div>
                <div className="text-xs text-brand-orange font-semibold">days in a row!</div>
                <div className="mt-2 text-[10px] font-semibold">Keep it going, superstar.</div>
                <div className="mt-3 grid grid-cols-7 gap-0.5">
                  {[1,1,1,1,1,0,0].map((d, i) => (
                    <div key={i} className={`h-4 w-4 rounded-full grid place-items-center text-[8px] ${d ? "bg-brand-green text-white" : "bg-muted"}`}>{d ? "✓" : ""}</div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-border p-2 text-left flex items-center gap-2">
                  <Award className="h-4 w-4 text-brand-orange" />
                  <div>
                    <div className="text-[9px] font-bold">Personal best</div>
                    <div className="font-display text-sm font-extrabold">£1,482</div>
                    <div className="text-[8px] text-brand-green">+18% vs your best by 14%</div>
                  </div>
                </div>
                <div className="mt-2 rounded-lg border border-border p-2 text-left">
                  <div className="text-[9px] font-bold">Daily Goal</div>
                  <div className="font-display font-extrabold">£160 / £200</div>
                  <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-brand-green" style={{ width: "80%" }} />
                  </div>
                </div>
              </div>
            </PhoneFrame>

            <PhoneFrame>
              <div>
                <div className="font-bold text-xs">👋 Hey Sarah!</div>
                <div className="font-display text-2xl font-extrabold leading-none mt-1">Stats just<br /><span className="text-brand-green">dropped</span> 🎉</div>
                <div className="text-[10px] text-muted-foreground mt-1">Here's how you crushed it<br />this week (May 4 – May 10)</div>
                <div className="mt-3 rounded-lg border border-border p-2">
                  <div className="text-[10px] font-bold">Your Top 3</div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-center">
                    {[
                      { l: "Wine", v: "78%", c: "var(--brand-orange)" },
                      { l: "Cocktails", v: "72%", c: "var(--brand-green)" },
                      { l: "Desserts", v: "64%", c: "oklch(0.82 0.16 80)" },
                    ].map((r) => (
                      <div key={r.l}>
                        <div className="mx-auto h-12 w-12 rounded-full grid place-items-center font-display font-extrabold text-xs"
                          style={{ background: `color-mix(in oklab, ${r.c} 18%, white)`, color: r.c, border: `3px solid ${r.c}` }}>{r.v}</div>
                        <div className="text-[8px] mt-1 font-semibold">{r.l}</div>
                        <div className="text-[8px] text-brand-green">+12%</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 rounded-lg p-2 text-left flex items-center gap-2"
                  style={{ background: "color-mix(in oklab, var(--brand-green) 12%, white)" }}>
                  <Trophy className="h-5 w-5 text-brand-green" />
                  <div className="text-[10px] font-bold">You smashed <span className="text-brand-green">desserts</span> this week!<br /><span className="font-normal text-brand-green">+18% vs last week</span></div>
                </div>
              </div>
            </PhoneFrame>

            <PhoneFrame>
              <div>
                <div className="text-center text-xs font-bold">Milestone progress</div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-12 w-12 rounded-full grid place-items-center bg-brand-orange/15"><Award className="h-6 w-6 text-brand-orange" /></div>
                  <div>
                    <div className="font-display font-extrabold">Rockstar</div>
                    <div className="text-[10px]"><span className="text-brand-green font-bold">3</span> of 5</div>
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-brand-green" style={{ width: "60%" }} />
                </div>
                <div className="mt-3 rounded-lg border border-border p-2">
                  <div className="text-[10px] font-bold">Next up: Legend</div>
                  <div className="text-[9px] text-muted-foreground">Hit £2,000 in tips in a week</div>
                </div>
                <div className="mt-3 text-[10px] font-bold">Recent achievements</div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  {[
                    { c: "var(--brand-orange)", t: "Dessert Pro", e: "🧁" },
                    { c: "oklch(0.5 0.18 270)", t: "Wine Whisperer", e: "🍷" },
                    { c: "var(--opportunity)", t: "Streak Legend", e: "⚡" },
                  ].map((b) => (
                    <div key={b.t}>
                      <div className="mx-auto h-10 w-10 rounded-full grid place-items-center text-base" style={{ background: b.c, color: "white" }}>{b.e}</div>
                      <div className="text-[8px] font-semibold mt-1">{b.t}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg p-2 text-[9px] font-bold"
                  style={{ background: "color-mix(in oklab, var(--brand-green) 12%, white)" }}>
                  You're in the TOP 10% of servers this week!<br /><span className="font-normal text-muted-foreground">Keep catching up.</span>
                </div>
              </div>
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* Feature row */}
      <section id="product" className="border-t border-border bg-white px-6 py-10">
        <div className="mx-auto max-w-7xl grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { i: "💰", t: "More Money", d: "Track what drives your tips." },
            { i: "🔥", t: "Build Streaks", d: "Daily momentum. Big results." },
            { i: "🎁", t: "Unlock Rewards", d: "Hit milestones. Earn bragging rights." },
            { i: "💬", t: "Smart Coaching", d: "Personal tips to help you grow." },
            { i: "🏆", t: "Friendly Competition", d: "Climb the leaderboard. Celebrate wins." },
          ].map((f) => (
            <div key={f.t} className="flex items-start gap-3">
              <div className="text-2xl">{f.i}</div>
              <div>
                <div className="font-bold text-sm">{f.t}</div>
                <div className="text-xs text-muted-foreground mt-1">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-6 pb-10">
        <div className="mx-auto max-w-7xl rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
          <div className="inline-flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-brand-green" />
            <span className="font-semibold">Helping restaurants turn sales data into coaching, motivation, and revenue growth.</span>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="text-sm font-bold text-brand-green">Ready to see your team win?</span>
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>See Demo</Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-6 py-20 bg-canvas">
        <div className="mx-auto max-w-6xl">
          <div className="text-xs uppercase tracking-widest text-brand-green font-bold">How it works</div>
          <h2 className="mt-2 font-display text-4xl md:text-5xl font-extrabold tracking-tight">Sales data in. Wins out.</h2>
          <ol className="mt-10 grid md:grid-cols-5 gap-4">
            {[
              "Manager uploads weekly sales data.",
              "Managers track coaching consistency, team performance, and estimated uplift.",
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

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight">Simple, transparent pricing</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {[
              { name: "Starter", price: "£99", priceId: "poppoff_starter_monthly", note: "/ month", featured: false, features: ["1 venue", "30-day free trial", "Personal server scorecards", "All coaching", "Menu intelligence"], cta: "Start Free Trial", action: "checkout" as const },
              { name: "Pro", price: "£199", priceId: "poppoff_pro_monthly", note: "/ month", featured: true, badge: "Most Popular", features: ["Up to 3 venues", "Everything in Starter", "Weekly win priorities", "Advanced insights", "Priority support"], cta: "Get Started", action: "checkout" as const },
              { name: "Enterprise", price: "Contact us", priceId: "", note: "4+ venues", featured: false, features: ["Unlimited venues", "Custom onboarding", "Dedicated success manager", "SLA & SSO available"], cta: "Let's Talk", action: "mailto" as const },
            ].map((p) => (
              <div key={p.name} className={`relative rounded-2xl border-2 p-6 ${p.featured ? "border-brand-orange" : "border-border bg-white"}`}>
                {p.featured && (
                  <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: "var(--brand-orange)" }}>Most Popular</span>
                )}
                <div className="font-bold">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1"><span className="font-display text-5xl font-extrabold">{p.price}</span><span className="text-sm text-muted-foreground">{p.note}</span></div>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-brand-green" />{f}</li>)}
                </ul>
                {p.action === "mailto" ? (
                  <a
                    href="mailto:hello@poppoffstats.com"
                    className={`mt-6 block w-full text-center rounded-xl py-3 text-sm font-bold border-2 border-brand-orange text-brand-orange`}
                  >
                    {p.cta}
                  </a>
                ) : (
                  <button
                    onClick={() => openCheckout({ priceId: p.priceId, successUrl: `${window.location.origin}/checkout/success?priceId=${encodeURIComponent(p.priceId)}` })}
                    disabled={loading}
                    className={`mt-6 block w-full text-center rounded-xl py-3 text-sm font-bold disabled:opacity-60 ${p.featured ? "text-white" : "border-2 border-brand-orange text-brand-orange"}`}
                    style={p.featured ? { background: "var(--brand-orange)" } : {}}
                  >
                    {loading ? "Opening…" : p.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">No contract. Cancel anytime.</p>
        </div>
      </section>

      {/* Closing benefits */}
      <section id="about" className="px-6 py-16 bg-canvas border-t border-border">
        <div className="mx-auto max-w-7xl grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { i: BarChart3, t: "Drive more revenue", d: "Increase spend per cover.", c: "var(--brand-green)" },
            { i: Users, t: "Build stronger teams", d: "Confidence and consistency.", c: "var(--brand-orange)" },
            { i: Target, t: "AI coaching that works", d: "Practical, personal, menu-specific.", c: "oklch(0.5 0.18 290)" },
            { i: BookOpen, t: "Menu intelligence", d: "Turn your menu into more sales.", c: "oklch(0.65 0.15 240)" },
            { i: Trophy, t: "Proven results", d: "See impact week on week.", c: "var(--brand-green)" },
          ].map((f) => (
            <div key={f.t} className="flex items-start gap-3">
              <f.i className="h-6 w-6 mt-0.5" style={{ color: f.c }} />
              <div>
                <div className="font-bold text-sm">{f.t}</div>
                <div className="text-xs text-muted-foreground mt-1">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 py-10 border-t border-border text-sm bg-white">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo />
            <span className="text-muted-foreground">© 2026 PoppOff. All rights reserved.</span>
          </div>
          <nav className="flex items-center gap-6 text-muted-foreground">
            <a href="mailto:hello@poppoffstats.com" className="hover:text-foreground">Contact</a>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
