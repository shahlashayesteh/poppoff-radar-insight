import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Upload, Sparkles, BarChart3, Users, BookOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Popp Off — Personal stats for every server" },
      { name: "description", content: "Popp Off turns weekly sales data into personal server scorecards, AI coaching, and menu-specific upsell recommendations for premium restaurants." },
      { property: "og:title", content: "Popp Off — Personal stats for every server" },
      { property: "og:description", content: "Personal scorecards, AI coaching, and menu-specific upsells for premium restaurant groups." },
    ],
  }),
  component: Landing,
});

function Section({ id, eyebrow, title, children }: any) {
  return (
    <section id={id} className="py-24 px-6">
      <div className="mx-auto max-w-6xl">
        {eyebrow && <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">{eyebrow}</div>}
        {title && <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight mb-10 max-w-3xl">{title}</h2>}
        {children}
      </div>
    </section>
  );
}

function Landing() {
  return (
    <div className="bg-canvas text-ink">
      {/* Top nav */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-success grid place-items-center text-ink font-bold">P</span>
            <span className="font-display font-semibold text-lg">Popp Off</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-white/80">
            <a href="#problem" className="hover:text-white">Problem</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-white/80 hover:text-white">Login</Link>
            <Button asChild size="sm" className="bg-success text-ink hover:bg-success/90">
              <a href="#demo">Book a demo</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="gradient-hero text-white pt-36 pb-28 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 mb-6 backdrop-blur">
            <Sparkles className="h-3 w-3" /> Premium hospitality intelligence
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-tight max-w-4xl leading-[1.05]">
            Popp Off. <span className="text-success">Personal stats</span> for every server.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/75">
            Your POS tells you what was sold. Popp Off shows who is missing revenue, where they are missing it, and what to coach next week.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-success text-ink hover:bg-success/90 rounded-full px-7">
              <a href="#demo">Book a demo <ArrowRight className="ml-2 h-4 w-4" /></a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10">
              <a href="#pricing">Start pilot</a>
            </Button>
          </div>

          {/* Hero preview cards */}
          <div className="mt-16 grid md:grid-cols-3 gap-4">
            {[
              { label: "Wine", status: "Opportunity", color: "var(--opportunity)", val: 42 },
              { label: "Desserts", status: "Strongest area", color: "var(--success)", val: 88 },
              { label: "Bottled Water", status: "Focus", color: "var(--warning)", val: 64 },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/70">{c.label}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `color-mix(in oklab, ${c.color} 22%, transparent)`, color: c.color === "var(--warning)" ? "white" : c.color }}>
                    {c.status}
                  </span>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div className="text-5xl font-display font-semibold">{c.val}<span className="text-xl text-white/50">%</span></div>
                  <div className="h-14 w-14 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${c.color} 70%, white), ${c.color})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <Section id="problem" eyebrow="The Problem" title="Sales reports do not coach servers.">
        <p className="text-lg text-muted-foreground max-w-3xl">
          Restaurants already receive sales reports, but managers often do not have time to turn them into personalised
          coaching for every server. Missed upselling opportunities in wine, water, cocktails, desserts, sides and specials
          reduce average spend per head.
        </p>
      </Section>

      {/* Solution */}
      <section className="bg-ink text-white py-24 px-6">
        <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/60 mb-3">The Solution</div>
            <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight">
              Personal scorecards. AI coaching. Menu-specific upsells.
            </h2>
            <p className="mt-6 text-white/70 text-lg">
              Popp Off turns weekly sales data into personal server scorecards, AI coaching, and menu-specific upsell
              recommendations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Users, title: "Server Scorecards", body: "Every server sees their weekly focus." },
              { icon: Sparkles, title: "AI Coaching", body: "Warm, practical, menu-specific tips." },
              { icon: BookOpen, title: "Menu Intelligence", body: "Pairings tied to your real menu." },
              { icon: BarChart3, title: "Manager Insight", body: "See where revenue is being missed." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <f.icon className="h-5 w-5 text-success mb-3" />
                <div className="font-medium">{f.title}</div>
                <div className="text-sm text-white/60 mt-1">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="From sales data to weekly focus in five steps.">
        <ol className="grid md:grid-cols-5 gap-4">
          {[
            "Manager uploads weekly sales data.",
            "Manager confirms menu priorities.",
            "Popp Off creates personal scorecards.",
            "Servers log in and see their weekly focus.",
            "Managers see coaching priorities and revenue opportunities.",
          ].map((step, i) => (
            <li key={i} className="rounded-2xl bg-white border border-border p-5">
              <div className="text-success font-display text-2xl font-semibold">0{i + 1}</div>
              <p className="mt-3 text-sm text-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Financial value */}
      <section className="bg-ink text-white py-24 px-6">
        <div className="mx-auto max-w-6xl grid md:grid-cols-3 gap-6">
          {[
            { kpi: "+£1,420", label: "Estimated weekly uplift if targets hit" },
            { kpi: "+8%", label: "Bottled water progress in pilot venues" },
            { kpi: "5 / 5", label: "Servers engaging with their scorecard weekly" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 p-8">
              <div className="font-display text-5xl font-semibold text-success">{s.kpi}</div>
              <div className="mt-2 text-white/70">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <Section id="features" eyebrow="Core features" title="Built for premium hospitality.">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            "Personal weekly scorecards",
            "AI coaching tied to your menu",
            "Menu intelligence and pairings",
            "Weekly manager priorities",
            "Team trends and engagement",
            "Multi-site head office view",
          ].map((f) => (
            <div key={f} className="rounded-2xl bg-white border border-border p-6 flex items-start gap-3">
              <Check className="h-5 w-5 text-success mt-0.5" />
              <span className="font-medium">{f}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" eyebrow="Pricing" title="Simple, per-venue pricing.">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: "Starter", price: "£99", note: "per venue / month", features: ["Server scorecards", "Manager dashboard", "Menu intelligence"], cta: "Start pilot" },
            { name: "Premium", price: "£199", note: "per venue / month", features: ["Everything in Starter", "Monthly 30-min strategic review", "Priority support"], cta: "Book a demo", featured: true },
            { name: "Founder rate", price: "£49", note: "locked in forever — first 5 venues", features: ["All Premium features", "Founding partner badge", "Direct line to product team"], cta: "Claim founder rate" },
          ].map((p) => (
            <div key={p.name} className={`rounded-2xl p-8 border ${p.featured ? "bg-ink text-white border-ink" : "bg-white border-border"}`}>
              <div className={`text-xs uppercase tracking-[0.16em] ${p.featured ? "text-success" : "text-muted-foreground"}`}>{p.name}</div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold">{p.price}</span>
                <span className={`text-sm ${p.featured ? "text-white/60" : "text-muted-foreground"}`}>{p.note}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Button asChild className={`mt-8 w-full rounded-full ${p.featured ? "bg-success text-ink hover:bg-success/90" : ""}`}>
                <a href="#demo">{p.cta}</a>
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Demo CTA */}
      <section id="demo" className="px-6 pb-24">
        <div className="mx-auto max-w-5xl rounded-3xl gradient-hero text-white p-12 md:p-16 text-center">
          <Upload className="h-6 w-6 text-success mx-auto" />
          <h2 className="mt-4 font-display text-3xl md:text-5xl font-semibold tracking-tight">See your team's weekly focus.</h2>
          <p className="mt-4 text-white/75 max-w-xl mx-auto">Book a 20-minute demo and we will show you the live server dashboard, AI coaching, and menu intelligence with your menu.</p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Button asChild size="lg" className="bg-success text-ink hover:bg-success/90 rounded-full px-7">
              <Link to="/login">Try the demo</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10">
              <a href="#pricing">Start pilot</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="px-6 py-10 text-sm text-muted-foreground border-t border-border">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-ink grid place-items-center text-success font-bold text-xs">P</span>
            <span>© 2026 Popp Off</span>
          </div>
          <div>Personal stats for every server.</div>
        </div>
      </footer>
    </div>
  );
}
