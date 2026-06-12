import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calculator")({
  head: () => ({
    meta: [
      { title: "Labor Leverage Score Calculator | PoppOff" },
      {
        name: "description",
        content:
          "Find out how many pounds of revenue every pound of floor labour produces. Twenty seconds, five sliders, your score on the band.",
      },
      { property: "og:title", content: "Labor Leverage Score Calculator | PoppOff" },
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

const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const gbp2 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
});

type Band = {
  name: "Green" | "Amber" | "Red";
  tone: "green" | "amber" | "red";
};

function bandFor(lls: number): Band {
  if (lls >= 13) return { name: "Green", tone: "green" };
  if (lls >= 10) return { name: "Amber", tone: "amber" };
  return { name: "Red", tone: "red" };
}

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
    <div
      className={cn(
        "border-b border-border py-6",
        isFirst && "border-t",
      )}
    >
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
  const [covers, setCovers] = useState(800);
  const [spend, setSpend] = useState(42);
  const [servers, setServers] = useState(10);
  const [rate, setRate] = useState(12.5);
  const [hours, setHours] = useState(25);
  const [spread, setSpread] = useState(0.12);
  const [tick, setTick] = useState(0);

  const labour = servers * rate * hours;
  const weeklyRev = covers * spend;
  const lls = labour > 0 ? weeklyRev / labour : 0;
  const band = bandFor(lls);
  const upliftPct = 0.5 * spread * ((servers - 1) / servers);
  const weekly = weeklyRev * upliftPct;
  const annual = weekly * 52;

  useEffect(() => {
    setTick((t) => t + 1);
  }, [covers, spend, servers, rate, hours, spread]);

  const stampToneClass =
    band.tone === "green"
      ? "border-success text-success"
      : band.tone === "amber"
        ? "border-warning text-warning"
        : "border-opportunity text-opportunity";

  const gapLabel = lls >= 13 ? "Above green line by" : "Gap to green (13.0x)";
  const gapValue = gbp0.format(Math.abs(lls - 13) * labour) + "/wk";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1060px] px-6 pb-20 pt-12">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-brand-orange">
          PoppOff · Labor Leverage Score™
        </p>
        <h1 className="max-w-[14ch] font-display text-[clamp(38px,6vw,68px)] font-extrabold uppercase leading-[0.98] tracking-tight">
          What is your floor's{" "}
          <span className="text-brand-orange">Labor Leverage Score?</span>
        </h1>
        <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-muted-foreground">
          Most operators manage labour as a cost. The best ones measure it as leverage:
          how many pounds of revenue every pound of floor labour produces. Five numbers
          you already know off by heart, twenty seconds, your score on the band.
        </p>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
          <div>
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
              output={gbp0.format(spend)}
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
              output={gbp2.format(rate)}
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
              Your Labor Leverage Score is the revenue your serving team produces for
              every pound it costs. Green is 13.0x and above, amber is 10.0 to 12.9x,
              red is below 10.0x. The unrealised revenue figure assumes your strongest
              server drives 12 to 20% higher spend per cover than the team average,
              mostly through wine, desserts and upsells, and that the rest of the team
              closes{" "}
              <strong className="font-semibold text-foreground">half</strong> that gap.
              Every assumption is shown, and your real numbers come from your own POS
              data: that is what PoppOff measures, server by server, every week. The
              full thinking is in{" "}
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
              <ReceiptLine label="Weekly revenue" value={gbp0.format(weeklyRev)} />
              <ReceiptLine label="Server labour (est.)" value={gbp0.format(labour)} />
              <ReceiptLine
                label="Servers as % of revenue"
                value={
                  weeklyRev > 0
                    ? ((labour / weeklyRev) * 100).toFixed(1) + "%"
                    : "0.0%"
                }
              />
              <ReceiptLine
                label="Best vs avg spread"
                value={Math.round(spread * 100) + "%"}
              />
              <hr className="my-4 border-t border-dashed border-border" />

              <div className="py-2 text-center">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Labor Leverage Score
                </p>
                <div
                  key={`stamp-${tick}`}
                  className={cn(
                    "inline-block -rotate-[7deg] rounded-md border-[3px] px-5 py-2 animate-in zoom-in-95 duration-150",
                    stampToneClass,
                  )}
                >
                  <div className="font-display text-[clamp(34px,4.5vw,44px)] leading-none tracking-[0.02em]">
                    {lls.toFixed(1)}x
                  </div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.26em]">
                    {band.name}
                  </div>
                </div>
              </div>

              <ReceiptLine label={gapLabel} value={gapValue} />
              <hr className="my-4 border-t border-dashed border-border" />

              <p className="mt-1 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Left on the table / year
              </p>
              <p
                key={`total-${tick}`}
                className="mt-1.5 text-center font-display text-[clamp(34px,4.5vw,44px)] leading-tight text-brand-orange animate-in zoom-in-95 duration-150"
              >
                {gbp0.format(annual)}
              </p>
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                that is {gbp0.format(servers > 0 ? annual / servers : 0)} per server,
                per year
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
