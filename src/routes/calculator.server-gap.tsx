import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { parseFile, type ParseResult } from "@/lib/server-gap/parse";
import {
  mergeRows,
  normaliseLabour,
  normaliseSales,
  type SalesBasis,
} from "@/lib/server-gap/merge";
import {
  attachGap,
  computeRecoverable,
  computeServerMetrics,
  computeShiftMetrics,
  computeTeamBenchmark,
  projectPeriod,
  type Period,
} from "@/lib/server-gap/calc";
import { buildWarnings } from "@/lib/server-gap/warnings";
import { computeConfidence } from "@/lib/server-gap/confidence";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const META_DESCRIPTION =
  "See the real revenue gap between your servers. Upload your POS sales and labour exports — processed in your browser, never sent to our servers. Ranks by opportunity-adjusted revenue per hour.";

export const Route = createFileRoute("/calculator/server-gap")({
  head: () => ({
    meta: [
      { title: "Server Revenue Gap Calculator | PoppOff" },
      { name: "description", content: META_DESCRIPTION },
      { property: "og:title", content: "Server Revenue Gap Calculator | PoppOff" },
      { property: "og:description", content: META_DESCRIPTION },
      { name: "twitter:description", content: META_DESCRIPTION },
      { property: "og:url", content: "https://poppoffstats.com/calculator/server-gap" },
    ],
    links: [{ rel: "canonical", href: "https://poppoffstats.com/calculator/server-gap" }],
  }),
  component: ServerGapPage,
});

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (c: string, n: number) => `${c}${nf0.format(Math.round(n))}`;
const money2 = (c: string, n: number) => `${c}${nf2.format(n)}`;

type UploadKind = "sales" | "labour";

type FieldReq = { label: string; aliases: string[] };
const REQUIRED_SALES: FieldReq[] = [
  { label: "server name or ID", aliases: ["server_name", "server_id"] },
  { label: "shift date", aliases: ["shift_date"] },
  { label: "net or gross sales", aliases: ["net_sales", "gross_sales"] },
];
const PREFERRED_SALES: FieldReq[] = [
  { label: "shift start time", aliases: ["shift_start"] },
  { label: "shift end time", aliases: ["shift_end"] },
];
const REQUIRED_LABOUR: FieldReq[] = [
  { label: "server name or ID", aliases: ["server_name", "server_id"] },
  { label: "shift date", aliases: ["shift_date"] },
  { label: "shift start time", aliases: ["shift_start"] },
  { label: "shift end or hours", aliases: ["shift_end", "hours"] },
];

function ServerGapPage() {
  const [salesFile, setSalesFile] = useState<{ name: string; result: ParseResult } | null>(null);
  const [labourFile, setLabourFile] = useState<{ name: string; result: ParseResult } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"£" | "$">("£");
  const [period, setPeriod] = useState<Period>("monthly");
  const [basis, setBasis] = useState<SalesBasis>("net");
  const [showPreview, setShowPreview] = useState(false);

  const handleFile = useCallback(async (kind: UploadKind, file: File) => {
    setParseError(null);
    try {
      const result = await parseFile(file);
      if (kind === "sales") setSalesFile({ name: file.name, result });
      else setLabourFile({ name: file.name, result });
    } catch (e) {
      setParseError(`Couldn't parse ${file.name}: ${(e as Error).message}`);
    }
  }, []);

  // Sales-basis auto-selection on upload
  const salesHasGross = salesFile?.result.detected.has("gross_sales") ?? false;
  const salesHasNet = salesFile?.result.detected.has("net_sales") ?? false;
  const effectiveBasis: SalesBasis = salesHasNet && salesHasGross
    ? basis
    : salesHasNet
      ? "net"
      : salesHasGross
        ? "gross"
        : basis;

  const analysis = useMemo(() => {
    if (!salesFile || !labourFile) return null;

    const sN = normaliseSales(salesFile.result.rows);
    const lN = normaliseLabour(labourFile.result.rows);
    const hasSalesStartTimes = sN.rows.some((r) => r.startMin != null);
    const merge = mergeRows(sN.rows, lN.rows, effectiveBasis);
    const shifts = computeShiftMetrics(merge.matched);
    const servers = computeServerMetrics(shifts);
    const team = computeTeamBenchmark(shifts);
    const ranked = attachGap(servers, team);
    const recoverable = computeRecoverable(ranked);

    // observed weeks span
    const dates = shifts.map((s) => s.date).sort();
    let weeks = 1;
    if (dates.length > 1) {
      const a = new Date(dates[0]);
      const b = new Date(dates[dates.length - 1]);
      weeks = Math.max(1, (+b - +a) / (1000 * 60 * 60 * 24 * 7) + 1 / 7);
    }
    const projected = projectPeriod(recoverable.weekly, period, weeks);

    const warnings = buildWarnings({
      salesRowsTotal: salesFile.result.rows.length,
      labourRowsTotal: labourFile.result.rows.length,
      salesRejected: sN.rejected,
      labourRejected: lN.rejected,
      ambiguous: merge.ambiguous,
      unmatchedSales: merge.unmatchedSales,
      unmatchedLabour: merge.unmatchedLabour,
      shifts,
      salesDetected: new Set(Array.from(salesFile.result.detected)),
      labourDetected: new Set(Array.from(labourFile.result.detected)),
      hasSalesStartTimes,
    });

    const confidence = computeConfidence({
      salesAccepted: sN.rows.length,
      matchedShifts: shifts,
      ambiguous: merge.ambiguous,
      unmatchedSales: merge.unmatchedSales,
    });

    return { sN, lN, merge, shifts, servers, team, ranked, recoverable, projected, warnings, confidence, weeks };
  }, [salesFile, labourFile, effectiveBasis, period]);

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-24 pt-10">
        <h1 className="max-w-[20ch] font-display text-[clamp(34px,5.5vw,60px)] font-extrabold uppercase leading-[0.98] tracking-tight">
          See the real <span className="text-brand-orange">revenue gap</span> between your servers.
        </h1>
        <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-muted-foreground">
          Total sales lie — they reward whoever worked the most hours on the best shifts. This calculator
          normalises by hours worked and adjusts for shift opportunity, then ranks your team by{" "}
          <strong className="text-foreground">opportunity-adjusted revenue per hour</strong>.
        </p>

        {/* Privacy reassurance */}
        <section className="mt-10 rounded-md border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Private by design.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Your files are processed in your browser only. They are not uploaded to our servers, not stored,
            and not shared.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            You can upload the export as it comes from your POS. If preferred, you can anonymise server names
            before uploading, as long as the same identifier is used consistently across the sales and labour
            files.
          </p>
        </section>

        {/* Currency selector */}
        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <span className="mr-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Currency
          </span>
          <ToggleGroup
            type="single"
            value={currency}
            onValueChange={(v) => v && setCurrency(v as "£" | "$")}
            variant="outline"
          >
            <ToggleGroupItem value="£" className="rounded-full px-4">UK (£)</ToggleGroupItem>
            <ToggleGroupItem value="$" className="rounded-full px-4">US ($)</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* How this works — explainer */}
        <Accordion type="single" collapsible className="mt-8 rounded-md border border-border bg-card px-5">
          <AccordionItem value="how" className="border-b-0">
            <AccordionTrigger className="py-4 text-left text-sm font-semibold hover:no-underline">
              How this works — matching, opportunity, results.
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                    1. What you upload (and why two files)
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><strong className="text-foreground">Sales export</strong> — per-server, per-shift sales rows (server, date, net or gross sales; optionally shift start/end).</li>
                    <li><strong className="text-foreground">Labour export</strong> — per-server shift rows (server, date, shift start, shift end or hours).</li>
                    <li>Two files because almost no POS exports both together. Templates for each are linked inside the upload cards below.</li>
                  </ul>
                </div>

                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                    2. How the two files are matched
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Join key: server identity (ID preferred, name fallback, case- and punctuation-normalised) plus shift date.</li>
                    <li>If a sales row has a start time, it's paired with the overlapping labour shift.</li>
                    <li>No start time + exactly one labour shift that day → auto-matched.</li>
                    <li>No start time + multiple labour shifts → flagged <strong className="text-foreground">Ambiguous</strong> and excluded from the calculation. Never guessed.</li>
                    <li>Unmatched rows on either side are surfaced in the warnings list.</li>
                  </ul>
                </div>

                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                    3. How shift opportunity is determined (you don't upload it)
                  </p>
                  <p className="mt-2">
                    Opportunity is inferred from the <strong className="text-foreground">actual start and end times</strong> of each labour shift. Daypart labels in your file are never used for calculation.
                  </p>
                  <p className="mt-2">
                    Each hour of the shift is scored against a day-of-week × hour-of-day grid, then averaged across the shift to produce one <strong className="text-foreground">Opportunity Factor</strong>:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><strong className="text-foreground">Low</strong> 0.75–0.90 — off-peak hours</li>
                    <li><strong className="text-foreground">Normal</strong> 0.95–1.05 — average trading hours</li>
                    <li><strong className="text-foreground">Strong</strong> 1.10–1.25 — busy lunch/dinner windows</li>
                    <li><strong className="text-foreground">Peak</strong> 1.30–1.40 — Fri/Sat dinner-style windows</li>
                  </ul>
                  <p className="mt-2">
                    Adjusted hours = hours × factor. A server who worked Friday dinner is held to a higher bar than one who worked Tuesday lunch. Same band language as the Labor Leverage Score on the manager dashboard, so the two tools speak the same language.
                  </p>
                </div>

                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                    4. What you'll see after both files are uploaded
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li><strong className="text-foreground">Confidence score</strong> (High / Medium / Low) plus any warnings — unmatched rows, ambiguous shifts, missing start times.</li>
                    <li><strong className="text-foreground">Ranking table</strong> — every server ordered by opportunity-adjusted revenue per hour vs the team's weighted benchmark.</li>
                    <li><strong className="text-foreground">Top vs bottom gap</strong> — the £/$ difference per adjusted hour between your best and weakest performer.</li>
                    <li><strong className="text-foreground">Recoverable revenue</strong> — what lifting the bottom half toward the benchmark would project weekly, monthly, and annually.</li>
                  </ol>
                </div>

                <p className="text-xs italic">
                  All of this is computed in your browser. No row of your data leaves this page.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Upload cards */}
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <UploadCard
            title="Sales export"
            file={salesFile}
            required={REQUIRED_SALES}
            preferred={PREFERRED_SALES}
            detected={salesFile?.result.detected}
            templateHref="/templates/server-gap-sales-template.csv"
            onFile={(f) => handleFile("sales", f)}
            onClear={() => setSalesFile(null)}
          />
          <UploadCard
            title="Labour export"
            file={labourFile}
            required={REQUIRED_LABOUR}
            preferred={[]}
            detected={labourFile?.result.detected}
            templateHref="/templates/server-gap-labour-template.csv"
            onFile={(f) => handleFile("labour", f)}
            onClear={() => setLabourFile(null)}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          For more privacy, you can replace names with Server 1, Server 2, Server 3 before uploading. This is
          optional.
        </p>
        {parseError && <p className="mt-3 text-sm text-destructive">{parseError}</p>}

        {/* Controls */}
        {salesFile && labourFile && (
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Period</span>
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v as Period)}
                variant="outline"
              >
                <ToggleGroupItem value="weekly" className="rounded-full px-3">Week</ToggleGroupItem>
                <ToggleGroupItem value="monthly" className="rounded-full px-3">Month</ToggleGroupItem>
                <ToggleGroupItem value="custom" className="rounded-full px-3">Observed</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {salesHasGross && salesHasNet && (
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Sales basis
                </span>
                <ToggleGroup
                  type="single"
                  value={basis}
                  onValueChange={(v) => v && setBasis(v as SalesBasis)}
                  variant="outline"
                >
                  <ToggleGroupItem value="net" className="rounded-full px-3">Net</ToggleGroupItem>
                  <ToggleGroupItem value="gross" className="rounded-full px-3">Gross</ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="ml-auto text-xs underline underline-offset-[3px] text-muted-foreground hover:text-foreground"
            >
              {showPreview ? "Hide" : "Show"} merge preview
            </button>
          </div>
        )}

        {/* Results */}
        {analysis && (
          <>
            {/* Confidence + warnings */}
            <section className="mt-8 rounded-md border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <ConfidencePill level={analysis.confidence.level} />
                <p className="text-xs text-muted-foreground">{analysis.confidence.driver}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                The result is only as accurate as the uploaded POS and labour data. Low confidence results
                should be treated as directional.
              </p>
              {analysis.warnings.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                  {analysis.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <span
                        className={cn(
                          "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                          w.level === "error"
                            ? "bg-destructive"
                            : w.level === "warn"
                              ? "bg-brand-orange"
                              : "bg-muted-foreground",
                        )}
                      />
                      <span className="text-muted-foreground">{w.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Merge preview */}
            {showPreview && (
              <MergePreview
                shifts={analysis.shifts}
                ambiguous={analysis.merge.ambiguous}
                currency={currency}
              />
            )}

            {/* Section 1 — Ranking */}
            {analysis.ranked.length > 0 && (
              <section className="mt-10">
                <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
                  Ranking — opportunity-adjusted revenue per hour
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({effectiveBasis === "net" ? "Net" : "Gross"} sales)
                  </span>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Team benchmark: <strong className="text-foreground">{money2(currency, analysis.team.adjustedRPH)}</strong> per
                  adjusted hour ({money0(currency, analysis.team.totalSales)} across{" "}
                  {nf1.format(analysis.team.totalAdjustedHours)} adjusted hours).
                </p>
                <div className="mt-5 overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">Server</th>
                        <th className="px-3 py-2.5 text-right">Shifts</th>
                        <th className="px-3 py-2.5 text-right">Sales</th>
                        <th className="px-3 py-2.5 text-right">Hours</th>
                        <th className="px-3 py-2.5 text-right">Adj. hrs</th>
                        <th className="px-3 py-2.5 text-right">Adj. RPH</th>
                        <th className="px-3 py-2.5 text-right">Gap vs team</th>
                        <th className="px-3 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.ranked.map((s, i) => (
                        <tr key={s.key} className="border-t border-border">
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium">{s.display}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{s.shifts}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{money0(currency, s.totalSales)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{nf1.format(s.totalHours)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{nf1.format(s.totalAdjustedHours)}</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums">{money2(currency, s.adjustedRPH)}</td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-right tabular-nums font-semibold",
                              s.gapPct > 0 ? "text-emerald-500" : s.gapPct < 0 ? "text-destructive" : "text-foreground",
                            )}
                          >
                            {s.gapPct > 0 ? "+" : ""}
                            {nf1.format(s.gapPct * 100)}%
                          </td>
                          <td className="px-3 py-2.5">
                            <RankPill rank={s.rank} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Ranked only by opportunity-adjusted RPH (Σ sales ÷ Σ adjusted hours). Total sales and total
                  hours are shown for context — never used for ranking.
                </p>
              </section>
            )}

            {/* Section 2 — Top vs bottom */}
            {analysis.ranked.length >= 2 && (
              <TopBottomGap ranked={analysis.ranked} currency={currency} />
            )}

            {/* Section 3 — Recoverable */}
            {analysis.ranked.length > 0 && analysis.recoverable.weekly > 0 && (
              <RecoverableSection
                ranked={analysis.ranked}
                weekly={analysis.recoverable.weekly}
                monthly={analysis.recoverable.monthly}
                annual={analysis.recoverable.annual}
                projected={analysis.projected}
                currency={currency}
                weeks={analysis.weeks}
              />
            )}

            {/* CTA */}
            <section className="mt-12 rounded-md border border-border bg-card p-7 text-center">
              <p className="font-display text-xl font-bold uppercase tracking-tight">
                This manual calculator shows the gap once.
                <br />
                <span className="text-brand-orange">PoppOff tracks it continuously.</span>
              </p>
              <p className="mx-auto mt-3 max-w-[48ch] text-sm text-muted-foreground">
                Book a call to see your full server performance breakdown — weekly, automated, and tied to
                coaching priorities.
              </p>
              <div className="mt-5 flex justify-center">
                <Button asChild size="lg">
                  <Link to="/contact">Book a call</Link>
                </Button>
              </div>
            </section>
          </>
        )}

        {!analysis && !parseError && (
          <section className="mt-10 rounded-md border border-dashed border-border bg-card/50 p-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Upload both exports above. You'll then see a <strong className="text-foreground">confidence score</strong>,
              a <strong className="text-foreground">server ranking</strong> by opportunity-adjusted revenue per hour,
              the <strong className="text-foreground">top-vs-bottom gap</strong>, and projected{" "}
              <strong className="text-foreground">recoverable revenue</strong> — without any data leaving your browser.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Not sure how it works? Open <em>"How this works"</em> above.
            </p>
          </section>
        )}
      </div>
  );
}

function ConfidencePill({ level }: { level: "High" | "Medium" | "Low" }) {
  const cls =
    level === "High"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : level === "Medium"
        ? "bg-brand-orange/15 text-brand-orange border-brand-orange/30"
        : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider",
        cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level} confidence
    </span>
  );
}

function RankPill({ rank }: { rank: "above" | "tracking" | "below" }) {
  const map = {
    above: { label: "Outperforming", cls: "bg-emerald-500/15 text-emerald-500" },
    tracking: { label: "Tracking", cls: "bg-brand-orange/15 text-brand-orange" },
    below: { label: "Below benchmark", cls: "bg-destructive/15 text-destructive" },
  } as const;
  const m = map[rank];
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold", m.cls)}>
      {m.label}
    </span>
  );
}

function UploadCard(props: {
  title: string;
  file: { name: string; result: ParseResult } | null;
  required: FieldReq[];
  preferred: FieldReq[];
  detected?: Set<string>;
  templateHref: string;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const has = (aliases: string[]) => aliases.some((a) => props.detected?.has(a));
  return (
    <div
      className={cn(
        "rounded-md border-2 border-dashed border-border bg-card p-5 transition-colors",
        dragging && "border-brand-orange bg-brand-orange/5",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) props.onFile(f);
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold uppercase tracking-wide">{props.title}</h3>
        <a
          href={props.templateHref}
          download
          className="text-xs text-brand-orange underline underline-offset-[3px]"
        >
          Download template
        </a>
      </div>

      {props.file ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{props.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {props.file.result.rows.length.toLocaleString()} rows · {props.file.result.rawHeaders.length} columns
          </p>
          <button
            type="button"
            onClick={props.onClear}
            className="mt-2 text-xs underline underline-offset-[3px] text-muted-foreground hover:text-foreground"
          >
            Replace file
          </button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-md border border-border bg-background p-6 text-center text-sm text-muted-foreground hover:bg-muted/30">
          <span>Drop CSV or XLSX here, or click to choose.</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onFile(f);
            }}
          />
        </label>
      )}

      <div className="mt-4 space-y-1.5 text-xs">
        <p className="font-mono uppercase tracking-wider text-muted-foreground">Required</p>
        <ul className="space-y-1">
          {props.required.map((r) => {
            const ok = has(r.aliases);
            return (
              <li key={r.label} className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>{r.label}</span>
              </li>
            );
          })}
        </ul>
        {props.preferred.length > 0 && (
          <>
            <p className="mt-2 font-mono uppercase tracking-wider text-muted-foreground">Preferred</p>
            <ul className="space-y-1">
              {props.preferred.map((r) => {
                const ok = has(r.aliases);
                return (
                  <li key={r.label} className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                    <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>{r.label}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function MergePreview({
  shifts,
  ambiguous,
  currency,
}: {
  shifts: ReturnType<typeof computeShiftMetrics>;
  ambiguous: { display: string; date: string; candidateLabourRows: number[] }[];
  currency: string;
}) {
  return (
    <section className="mt-8 rounded-md border border-border bg-card p-5">
      <h3 className="font-semibold uppercase tracking-wide">Merge preview</h3>
      {ambiguous.length > 0 && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
            Ambiguous — excluded from calculation
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {ambiguous.map((a, i) => (
              <li key={i}>
                {a.display} · {a.date} · {a.candidateLabourRows.length} possible labour shifts. Add a start
                time to the sales export to disambiguate.
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 max-h-72 overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 font-mono uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Server</th>
              <th className="px-2 py-2 text-left">Date</th>
              <th className="px-2 py-2 text-right">Sales</th>
              <th className="px-2 py-2 text-right">Hours</th>
              <th className="px-2 py-2 text-left">Band</th>
              <th className="px-2 py-2 text-right">Factor</th>
              <th className="px-2 py-2 text-right">Adj. RPH</th>
            </tr>
          </thead>
          <tbody>
            {shifts.slice(0, 200).map((s, i) => (
              <tr
                key={i}
                className={cn(
                  "border-t border-border",
                  s.factorDefaulted && "bg-destructive/5",
                  s.factorEstimated && !s.factorDefaulted && "bg-brand-orange/5",
                )}
              >
                <td className="px-2 py-1.5">{s.display}</td>
                <td className="px-2 py-1.5">{s.date}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money0(currency, s.sales)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{nf1.format(s.hours)}</td>
                <td className="px-2 py-1.5">{s.band}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {nf2.format(s.factor)}
                  {s.factorDefaulted && <span className="ml-1 text-destructive">·def</span>}
                  {s.factorEstimated && !s.factorDefaulted && <span className="ml-1 text-brand-orange">·est</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money2(currency, s.adjustedRPH)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shifts.length > 200 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing first 200 of {shifts.length} matched shifts.
        </p>
      )}
    </section>
  );
}

function TopBottomGap({
  ranked,
  currency,
}: {
  ranked: ReturnType<typeof attachGap>;
  currency: string;
}) {
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const gap = top.adjustedRPH - bottom.adjustedRPH;
  const gapPct = bottom.adjustedRPH > 0 ? (gap / bottom.adjustedRPH) * 100 : 0;
  return (
    <section className="mt-10 rounded-md border border-border bg-card p-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
        The real gap
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Strongest vs weakest server, after adjusting for hours worked and shift opportunity.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-emerald-500">Top</p>
          <p className="mt-1 text-lg font-bold">{top.display}</p>
          <p className="font-mono text-2xl font-bold tabular-nums">{money2(currency, top.adjustedRPH)}</p>
          <p className="text-xs text-muted-foreground">per adjusted hour</p>
        </div>
        <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-destructive">Bottom</p>
          <p className="mt-1 text-lg font-bold">{bottom.display}</p>
          <p className="font-mono text-2xl font-bold tabular-nums">{money2(currency, bottom.adjustedRPH)}</p>
          <p className="text-xs text-muted-foreground">per adjusted hour</p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-relaxed">
        That's a <strong className="text-brand-orange">{money2(currency, gap)} per adjusted hour</strong> spread
        — {nf1.format(gapPct)}% more revenue from the same shift opportunity.
      </p>
    </section>
  );
}

function RecoverableSection({
  ranked,
  weekly,
  monthly,
  annual,
  projected,
  currency,
  weeks,
}: {
  ranked: ReturnType<typeof attachGap>;
  weekly: number;
  monthly: number;
  annual: number;
  projected: { label: string; value: number };
  currency: string;
  weeks: number;
}) {
  const below = ranked.filter((s) => s.recoverableWeekly > 0);
  return (
    <section className="mt-10 rounded-md border border-border bg-card p-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
        Recoverable opportunity
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        If every below-benchmark server reached the team average (not the top performer) — same hours, same
        shifts. Conservative by design.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Per week" value={money0(currency, weekly)} />
        <Metric label="Per month" value={money0(currency, monthly)} />
        <Metric label="Per year" value={money0(currency, annual)} emphasis />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Selected period: <strong className="text-foreground">{money0(currency, projected.value)}</strong>{" "}
        {projected.label}. Data span observed: {nf1.format(weeks)} week(s).
      </p>
      {below.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Where the recoverable comes from
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {below.map((s) => (
              <li key={s.key} className="flex justify-between gap-3">
                <span>{s.display}</span>
                <span className="tabular-nums text-muted-foreground">
                  +{money0(currency, s.recoverableWeekly)}/week
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "rounded border border-border p-4",
        emphasis && "border-brand-orange/40 bg-brand-orange/5",
      )}
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", emphasis && "text-brand-orange")}>
        {value}
      </p>
    </div>
  );
}
