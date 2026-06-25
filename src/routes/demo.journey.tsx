// Phase 23 — Public sales demo journey.
//
// A single guided overview of the PoppOff story that links into the existing
// /demo/* manager and server pages. No auth required. No manager intelligence
// is exposed here — only the journey map. Each step links to a demo page that
// already enforces its own scope (manager vs server).
import { createFileRoute, Link } from "@tanstack/react-router";
import { DEMO_JOURNEY } from "@/lib/pilot/leadership";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/demo/journey")({
  head: () => ({
    meta: [
      { title: "PoppOff sales demo journey — restaurant revenue gap" },
      { name: "description", content: "Walk the PoppOff demo journey: trusted data, LLS, server insight, coaching approval, OF v2 preview, ROI report and the 30-day pilot next step." },
      { property: "og:title", content: "PoppOff sales demo journey" },
      { property: "og:description", content: "How PoppOff turns restaurant POS and labour data into measured improvement and modelled opportunity — without guaranteed revenue claims." },
    ],
  }),
  component: DemoJourneyPage,
});

function DemoJourneyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-primary font-medium">Sales demo</p>
          <h1 className="text-4xl font-semibold tracking-tight">Your existing restaurant data can reveal where revenue is leaking and where labour is creating value.</h1>
          <p className="text-muted-foreground max-w-2xl">
            This guided journey walks through how PoppOff turns POS sales and labour data into trusted operator intelligence,
            separating <strong>measured improvement already achieved</strong> from <strong>modelled remaining opportunity</strong>.
            Modelled numbers are <strong>not guaranteed revenue</strong>.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
              Book the Revenue Gap Audit <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/calculator/server-gap" className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm hover:bg-muted">
              Try the server-gap calculator
            </Link>
          </div>
        </header>

        <ol className="space-y-4">
          {DEMO_JOURNEY.map((step) => (
            <li key={step.id} className="rounded-xl border border-border bg-white p-5 flex items-start gap-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">{step.number}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{step.title}</h2>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{step.category.replace("_", " ")}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{step.blurb}</p>
              </div>
              <a href={step.href} className="text-sm inline-flex items-center gap-1 text-primary hover:underline">
                Open <ArrowRight className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ol>

        <section className="rounded-xl border border-border bg-muted/30 p-6">
          <h2 className="text-lg font-semibold mb-3">Trusted language used throughout the demo</h2>
          <ul className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> Measured from POS</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> Derived from POS plus labour data</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> Modelled opportunity (not guaranteed revenue)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> Preview only (OF v2 does not change Adjusted LLS)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> Confidence depends on data quality</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> Contextual data is not used for hard scoring unless verified</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
