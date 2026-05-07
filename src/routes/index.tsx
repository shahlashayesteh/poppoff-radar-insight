import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { Star, Trophy, Award, Check, ShieldCheck, BarChart3, Users, BookOpen, Target } from "lucide-react";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PoppOff — Every shift. Every win." },
      { name: "description", content: "Personal stats, streaks, and milestones for restaurant servers. Turn your numbers into momentum and more money in your pocket." },
      { property: "og:title", content: "PoppOff — Every shift. Every win." },
      { property: "og:description", content: "Personal stats, streaks, and milestones for restaurant servers." },
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
            <a href="#product" className="hover:text-brand-green">Product</a>
            <a href="#how" className="hover:text-brand-green">How it works</a>
            <a href="#pricing" className="hover:text-brand-green">Pricing</a>
            <a href="#about" className="hover:text-brand-green">About</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>Book a Demo</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-14 pb-20">
        <div className="mx-auto max-w-7xl grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold">
              🔥 Loved by servers. Trusted by top restaurants.
            </div>
            <h1 className="mt-5 font-display font-extrabold tracking-tight text-6xl md:text-7xl leading-[0.95]">
              Popp Off.<br />
              <span style={{ color: "var(--brand-green)" }}>Every shift.</span><br />
              Every win.
            </h1>
            <p className="mt-6 text-base md:text-lg text-foreground/75 max-w-md">
              Your personal stats, streaks, and milestones — all in one app. PoppOff shows what's killing it.
              We turn your numbers into momentum and more money in your pocket.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold text-white inline-flex items-center gap-2" style={{ background: "var(--brand-orange)" }}>
                Book a Demo
              </Link>
              <Link to="/login" className="rounded-xl px-6 py-3 text-sm font-bold border-2 border-foreground inline-flex items-center gap-2">
                Start Your Pilot
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex text-brand-orange">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-5 w-5 fill-current" />)}
              </div>
              <span className="text-sm font-semibold">4.9 / 5 from 500+ servers</span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-muted-foreground tracking-wider uppercase">
              <span className="font-bold">⚓ Garden Table</span>
              <span className="font-bold">URBAN PLATE</span>
              <span className="font-bold">NORTH & OAK</span>
            </div>
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
            <span className="font-semibold">Join 500+ servers already leveling up their shifts.</span>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="text-sm font-bold text-brand-green">Ready to see your team win?</span>
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: "var(--brand-orange)" }}>Book a Demo</Link>
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
              "Manager confirms menu priorities.",
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
              { name: "Starter", price: "£99", priceId: "poppoff_pro_monthly", note: "/ venue / month", featured: false, features: ["Personal server scorecards", "All coaching", "Menu intelligence", "Team dashboard", "Email support"], cta: "Start 30-Day Trial" },
              { name: "Premium", price: "£199", priceId: "poppoff_enterprise_monthly", note: "/ venue / month", featured: true, badge: "Most Popular", features: ["Everything in Starter", "Weekly win priorities", "Advanced insights", "Priority support"], cta: "Start 30-Day Trial" },
              { name: "Founder Rate", price: "£49", priceId: "poppoff_starter_monthly", note: "/ venue / month", featured: false, features: ["Locked in forever", "First venues only", "Everything in Starter"], cta: "Claim Founder Rate" },
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
                <button
                  onClick={() => openCheckout({ priceId: p.priceId })}
                  disabled={loading}
                  className={`mt-6 block w-full text-center rounded-xl py-3 text-sm font-bold disabled:opacity-60 ${p.featured ? "text-white" : "border-2 border-brand-orange text-brand-orange"}`}
                  style={p.featured ? { background: "var(--brand-orange)" } : {}}
                >
                  {loading ? "Opening…" : p.cta}
                </button>
              </div>
            ))}
          </div>
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

      <footer className="px-6 py-8 border-t border-border text-sm">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="text-muted-foreground">© 2026 PoppOff. Every shift. Every win.</div>
        </div>
      </footer>
    </div>
  );
}
