import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calculator")({
  head: () => ({
    meta: [
      { title: "Floor Leverage Check | PoppOff" },
      {
        name: "description",
        content:
          "Find out how many pounds of revenue every pound of floor labour produces. Twenty seconds, five sliders, your score on the band.",
      },
      { property: "og:title", content: "Floor Leverage Check | PoppOff" },
      {
        property: "og:description",
        content:
          "Find out how many pounds of revenue every pound of floor labour produces. Twenty seconds, five sliders, your score on the band.",
      },
      { property: "og:url", content: "https://poppoffstats.com/calculator" },
    ],
    links: [{ rel: "canonical", href: "https://poppoffstats.com/calculator" }],
  }),
  component: CalculatorPage,
});

const ARTICLE_URL = "https://www.linkedin.com/pulse/labor-cost-trap-shahla-shayesteh-nlrpf/";

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nf2 = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money0 = (currency: string, n: number) => `${currency}${nf0.format(Math.round(n))}`;
const money2 = (currency: string, n: number) => `${currency}${nf2.format(n)}`;

function Field({
  id,
  label,
  output,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  isFirst,
}: {
  id: string;
  label: string;
  output: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  isFirst?: boolean;
}) {
  return (
    <div className={cn("border-b border-border py-6", isFirst && "border-t")}>
      <div className="mb-4 flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-xl font-bold text-foreground">
          {output}
        </output>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-2.5 text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

function CalculatorPage() {
  const [market, setMarket] = useState<"UK" | "US">("UK");
  const [covers, setCovers] = useState(800);
  const [spend, setSpend] = useState(42);
  const [servers, setServers] = useState(10);
  const [rate, setRate] = useState(12.5);
  const [hours, setHours] = useState(25);
  const [onCost, setOnCost] = useState(0.15);
  const [spread, setSpread] = useState(0.12);
  const [tick, setTick] = useState(0);

  const currency = market === "UK" ? "£" : "$";

  // When market changes, reset on-cost to that market's default. User can still override after.
  useEffect(() => {
    setOnCost(market === "UK" ? 0.15 : 0.12);
  }, [market]);

  const labour = servers * rate * hours * (1 + onCost);
  const weeklyRev = covers * spend;
  const lls = labour > 0 ? weeklyRev / labour : 0;
  const floorLabourPct = weeklyRev > 0 ? (labour / weeklyRev) * 100 : 0;

  const coversFromRest = servers > 0 ? covers * ((servers - 1) / servers) : 0;
  const perCoverGap = (s: number) => spend * s;
  const weeklyUpside = (s: number) => (spend * s) / 2 * coversFromRest;
  const annualUpside = (s: number) => weeklyUpside(s) * 52;
  const upsidePctOfRev = (s: number) =>
    weeklyRev > 0 ? (weeklyUpside(s) / weeklyRev) * 100 : 0;

  useEffect(() => {
    setTick((t) => t + 1);
  }, [covers, spend, servers, rate, hours, spread, onCost, market]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1060px] px-6 pb-20 pt-12">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-brand-orange">
          PoppOff · Floor Leverage Check™
        </p>
        <h1 className="max-w-[18ch] font-display text-[clamp(38px,6vw,68px)] font-extrabold uppercase leading-[0.98] tracking-tight">
          How hard is your floor's{" "}
          <span className="text-brand-orange">labour working?</span>
        </h1>
        <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-muted-foreground">
          Most operators manage labour as a cost. The best ones measure it as leverage:
          how many pounds of revenue every pound of floor labour produces. Five numbers
          you already know off by heart, twenty seconds, your score on the band.
        </p>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
          <div>
            {/* Market toggle */}
            <div
              className="flex flex-wrap items-center gap-2.5 pb-2"
              role="group"
              aria-label="Market"
            >
              <span className="mr-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Market
              </span>
              <ToggleGroup
                type="single"
                value={market}
                onValueChange={(v) => {
                  if (!v) return;
                  setMarket(v as "UK" | "US");
                }}
                variant="outline"
              >
                <ToggleGroupItem value="UK" className="rounded-full px-4">
                  UK (£)
                </ToggleGroupItem>
                <ToggleGroupItem value="US" className="rounded-full px-4">
                  US ($)
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Field
              isFirst
              id="covers"
              label="Covers per week"
              output={covers.toLocaleString("en-GB")}
              hint="All services combined, one venue."
              min={100}
              max={3000}
              step={50}
              value={covers}
              onChange={setCovers}
            />
            <Field
              id="spend"
              label="Average spend per cover"
              output={money0(currency, spend)}
              hint="Food and drink, before service."
              min={15}
              max={150}
              step={1}
              value={spend}
              onChange={setSpend}
            />
            <Field
              id="servers"
              label="Servers on the team"
              output={String(servers)}
              hint="Everyone who takes orders, full and part time."
              min={2}
              max={40}
              step={1}
              value={servers}
              onChange={setServers}
            />
            <Field
              id="rate"
              label="Average server hourly rate"
              output={money2(currency, rate)}
              hint="Base wage before NI, pension and tronc."
              min={10}
              max={20}
              step={0.25}
              value={rate}
              onChange={setRate}
            />
            <Field
              id="hours"
              label="Average hours per server, per week"
              output={String(hours)}
              hint="Rough average across full and part time."
              min={8}
              max={48}
              step={1}
              value={hours}
              onChange={setHours}
            />

            {/* On-cost toggle */}
            <div
              className="mt-7 flex flex-wrap items-center gap-2.5"
              role="group"
              aria-label="Employer on-costs"
            >
              <span className="mr-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Employer on-costs
              </span>
              <ToggleGroup
                type="single"
                value={String(onCost)}
                onValueChange={(v) => {
                  if (!v) return;
                  setOnCost(parseFloat(v));
                }}
                variant="outline"
              >
                <ToggleGroupItem value="0" className="rounded-full px-4">
                  Off · 0%
                </ToggleGroupItem>
                <ToggleGroupItem value="0.10" className="rounded-full px-4">
                  Low · 10%
                </ToggleGroupItem>
                <ToggleGroupItem
                  value={market === "UK" ? "0.15" : "0.12"}
                  className="rounded-full px-4"
                >
                  Standard · {market === "UK" ? "15%" : "12%"}
                </ToggleGroupItem>
                <ToggleGroupItem value="0.20" className="rounded-full px-4">
                  High · 20%
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <p className="mt-2 max-w-[62ch] text-xs text-muted-foreground">
              Employer on-costs on top of base wage. UK: National Insurance, pension,
              holiday pay (~15%). US: FICA, unemployment, workers' comp (~12%). Adjust
              to match your payroll.
            </p>

            <div
              className="mt-7 flex flex-wrap items-center gap-2.5"
              role="group"
              aria-label="Performance spread assumption"
            >
              <span className="mr-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Spread between best and average server
              </span>
              <ToggleGroup
                type="single"
                value={String(spread)}
                onValueChange={(v) => {
                  if (!v) return;
                  setSpread(parseFloat(v));
                }}
                variant="outline"
              >
                <ToggleGroupItem value="0.12" className="rounded-full px-4">
                  Conservative · 12%
                </ToggleGroupItem>
                <ToggleGroupItem value="0.20" className="rounded-full px-4">
                  Typical · 20%
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <p className="mt-12 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">
                How the score works.
              </strong>{" "}
              This is the quick check: venue-level, five inputs, directional. Your full
              Labor Leverage Score™ is calculated per server, weighted by revenue
              per cover and adjusted by your venue's Opportunity Factor, and it
              needs your POS data: that is what PoppOff measures, server by server,
              every week. Labour is shown fully loaded — base wage plus employer
              on-costs — so figures reflect true cost, not gross pay. The upside
              estimate assumes your strongest server lifts spend per cover by 12–20%
              and the rest of the floor closes{" "}
              <strong className="font-semibold text-foreground">half</strong> that gap;
              it is a directional estimate, and your own POS gives the exact figure.
              Benchmarks differ by market: UK total labour runs 30–35%, US
              front-of-house 8–12% in tipped-wage states and higher where servers earn
              full minimum wage. The full thinking is in{" "}
              <a
                href={ARTICLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-orange underline underline-offset-[3px]"
              >
                The Labor Cost Trap
              </a>
              .
            </p>
          </div>

          <div className="lg:sticky lg:top-8">
            <div
              className="relative overflow-hidden rounded-sm bg-card p-7 pb-9 font-mono text-card-foreground shadow-2xl"
              aria-live="polite"
            >
              <div className="text-center">
                <div className="font-display text-2xl uppercase tracking-[0.06em]">
                  PoppOff
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  *** FLOOR PERFORMANCE AUDIT ***
                </div>
              </div>
              <hr className="my-4 border-t border-dashed border-border" />
              <ReceiptLine label="Weekly revenue" value={money0(currency, weeklyRev)} />
              <ReceiptLine
                label="Floor labour, fully loaded (est.)"
                value={money0(currency, labour)}
              />
              <ReceiptLine
                label="Best vs avg spread"
                value={Math.round(spread * 100) + "%"}
              />
              <hr className="my-4 border-t border-dashed border-border" />

              <div key={`headline-${tick}`} className="py-1 animate-in zoom-in-95 duration-150">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Per-cover gap
                </p>
                <p className="text-[13px] leading-relaxed text-foreground">
                  Your strongest server runs about{" "}
                  <strong className="font-bold">
                    {money2(currency, perCoverGap(0.12))} to{" "}
                    {money2(currency, perCoverGap(0.20))}
                  </strong>{" "}
                  higher spend per cover than your team average.
                </p>
              </div>

              <hr className="my-4 border-t border-dashed border-border" />

              <div key={`upside-${tick}`} className="py-1 animate-in zoom-in-95 duration-150">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Potential upside
                </p>
                <p className="text-[13px] leading-relaxed text-foreground">
                  If the rest of your floor closed half that gap, that's roughly{" "}
                  <strong className="font-bold text-brand-orange">
                    {money0(currency, annualUpside(0.12))} to{" "}
                    {money0(currency, annualUpside(0.20))} a year
                  </strong>{" "}
                  — about {nf1.format(upsidePctOfRev(0.12))}% to{" "}
                  {nf1.format(upsidePctOfRev(0.20))}% of revenue.
                </p>
              </div>

              <hr className="my-4 border-t border-dashed border-border" />

              <p className="text-[13px] leading-relaxed text-foreground">
                Floor labour, fully loaded:{" "}
                <strong className="font-bold">
                  {money0(currency, labour)}/week — {nf1.format(floorLabourPct)}% of
                  revenue.
                </strong>
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {market === "UK"
                  ? "UK hospitality labour typically runs 30–35% of revenue; front-of-house runs higher than the US because servers earn full minimum wage, not a tipped rate."
                  : `Full-service front-of-house labour commonly runs 8–12% of sales in tipped-wage states. In no-tip-credit states (CA, WA, OR, NV and others) servers earn full minimum wage, so floor labour runs higher — often 14–16%. Yours is ${nf1.format(floorLabourPct)}%.`}
              </p>
              {market === "US" && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                  In tipped-wage states, low cash wages make floor labour % look lean —
                  tips are customer-funded, so read this alongside total server
                  earnings.
                </p>
              )}
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                Directional — your own P&amp;L tells the real story. Every assumption
                here is shown.
              </p>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                Leverage: {nf1.format(lls)}x revenue per {currency}1 of floor labour.
              </p>

              <hr className="my-4 border-t border-dashed border-border" />

              <Button asChild size="lg" className="w-full">
                <Link to="/signup">Find your real score, free for 30 days</Link>
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                One CSV upload. No card. No contract.
              </p>
              <a
                href={ARTICLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3.5 block text-center text-xs text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
              >
                Read: The Labor Cost Trap →
              </a>
              <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted-foreground">
                Estimate based on the assumptions shown. Your POS data tells the true
                story.
                <br />
                poppoffstats.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13px] leading-loose">
      <span className="text-muted-foreground">{label}</span>
      <span className="whitespace-nowrap font-bold text-foreground">{value}</span>
    </div>
  );
}
