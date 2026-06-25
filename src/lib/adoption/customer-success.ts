// Phase 26 — Customer Success and Adoption Layer.
//
// Pure helpers and static constants for the manager adoption workflow.
// No I/O, no DOM, no server access. Safe to import anywhere on the
// manager side. MUST NOT be imported by /server/* routes.
//
// Hard rules:
//   - No LLS, ROI, provenance, evidence, modelled-revenue language leaks
//     to anything intended for servers.
//   - Coaching framing, not punishment framing.
//   - Operator-friendly language; no formulas.

export type AdoptionStatus = "ok" | "warn" | "missing";

export interface AdoptionChecklistItem {
  id: string;
  label: string;
  detail: string;
  /** Manager-side route the item links to. Never a /server/* route. */
  href: string;
}

export interface AdoptionChecklistGroup {
  title: string;
  items: AdoptionChecklistItem[];
}

/**
 * Pilot adoption checklist surfaced on /manager/adoption.
 * Order reflects the natural pilot flow: data → quality → insight →
 * priorities → coaching → engagement → review → notes → handoff.
 */
export const ADOPTION_CHECKLIST: AdoptionChecklistGroup[] = [
  {
    title: "Foundations",
    items: [
      {
        id: "upload_data",
        label: "Upload trusted data",
        detail: "POS sales and labour hours imports for the pilot period.",
        href: "/manager/imports",
      },
      {
        id: "review_data_quality",
        label: "Review data quality",
        detail: "Resolve identity warnings and confirm sales/labour basis before reading people.",
        href: "/manager/data-onboarding",
      },
    ],
  },
  {
    title: "Insight",
    items: [
      {
        id: "review_lls_reports",
        label: "Review LLS and reports",
        detail: "Look at trends weighted by hours — not averages of averages.",
        href: "/manager/lls",
      },
      {
        id: "review_roi_pilot",
        label: "Review ROI and pilot page",
        detail: "Measured improvement and modelled remaining opportunity, kept separate.",
        href: "/manager/roi",
      },
    ],
  },
  {
    title: "Action",
    items: [
      {
        id: "set_priorities",
        label: "Set weekly priorities",
        detail: "Approve AI suggestions before they reach servers.",
        href: "/manager/priorities",
      },
      {
        id: "review_coaching",
        label: "Review coaching actions",
        detail: "Make sure what servers see is coaching, not punishment.",
        href: "/manager/coaching",
      },
    ],
  },
  {
    title: "Engagement & review",
    items: [
      {
        id: "server_engagement",
        label: "Check server engagement",
        detail: "Are servers logging in and acknowledging focus areas?",
        href: "/manager/team",
      },
      {
        id: "weekly_review",
        label: "Run weekly manager review",
        detail: "Use the rhythm below — Monday review, Tuesday priorities, midweek check, weekend focus, end-of-week summary.",
        href: "/manager/adoption",
      },
      {
        id: "pilot_notes",
        label: "Capture pilot notes",
        detail: "What changed, what data quality issues you found, what to test next week.",
        href: "/manager/adoption",
      },
      {
        id: "leadership_summary",
        label: "Prepare leadership summary",
        detail: "Use the pilot page to export a defensible, modelled-not-guaranteed summary.",
        href: "/manager/pilot",
      },
    ],
  },
];

/** Flat list of all checklist item IDs in canonical order. */
export const ADOPTION_CHECKLIST_IDS: string[] = ADOPTION_CHECKLIST.flatMap((g) =>
  g.items.map((i) => i.id),
);

// ---------- Weekly review rhythm ----------

export interface WeeklyRhythmStep {
  day: "Monday" | "Tuesday" | "Midweek" | "Weekend" | "End of week";
  focus: string;
  action: string;
}

export const WEEKLY_REVIEW_RHYTHM: WeeklyRhythmStep[] = [
  { day: "Monday", focus: "Review previous week performance", action: "Re-import POS and labour data. Look at weighted trends, not averages." },
  { day: "Tuesday", focus: "Set priorities", action: "Approve weekly priorities and category focus before they reach servers." },
  { day: "Midweek", focus: "Check coaching engagement", action: "See which servers acknowledged their focus area. Coach, do not punish." },
  { day: "Weekend", focus: "Monitor category focus", action: "Watch the priority categories mid-service. Compare like with like." },
  { day: "End of week", focus: "Export leadership summary", action: "Use the pilot page to export measured + modelled-not-guaranteed summary." },
];

// ---------- Customer-success language ----------

/**
 * Core coaching-first principles surfaced on the adoption page. These
 * exact phrases are referenced in Phase 26 tests — do not rename.
 */
export const CUSTOMER_SUCCESS_PRINCIPLES: string[] = [
  "Use this as coaching, not punishment.",
  "Focus on one behaviour at a time.",
  "Review data quality before reviewing people.",
  "Do not blame a server when the data confidence is low.",
  "Compare like with like.",
  "Measured data first, context second.",
];

// ---------- Pilot notes prompts ----------

export const PILOT_NOTES_PROMPTS: string[] = [
  "What changed this week?",
  "What data quality issue did we find?",
  "Which server behaviour improved?",
  "Which category needs focus?",
  "What should we test next week?",
  "What should leadership know?",
];

// ---------- Leadership handoff links ----------

export interface LeadershipHandoffLink {
  label: string;
  href: string;
  blurb: string;
}

export const LEADERSHIP_HANDOFF_LINKS: LeadershipHandoffLink[] = [
  { label: "ROI report", href: "/manager/roi", blurb: "Measured movement and modelled remaining opportunity." },
  { label: "Pilot readiness", href: "/manager/pilot", blurb: "Pilot setup, success criteria and exportable summary." },
  { label: "Evidence trace", href: "/manager/reports", blurb: "Where each headline number came from." },
  { label: "Data onboarding", href: "/manager/data-onboarding", blurb: "Required, optional and contextual fields, plus templates." },
  { label: "Weekly priorities", href: "/manager/priorities", blurb: "Approved focus areas reaching servers." },
  { label: "Export summary", href: "/manager/pilot", blurb: "Copyable leadership-friendly text." },
];

// ---------- Adoption status indicators ----------

export interface AdoptionSignals {
  hasUploadedData: boolean;
  dataQualityReviewed: boolean;
  prioritiesCreated: boolean;
  coachingVisible: boolean;
  roiViewed: boolean;
  pilotSummaryReady: boolean;
  serverActivityVisible: boolean;
}

export interface AdoptionIndicator {
  id: keyof AdoptionSignals;
  label: string;
  status: AdoptionStatus;
  detail: string;
}

/**
 * Convert raw signals into a stable, ordered list of indicators with
 * safe defaults when a signal is missing/false. Pure — no time, no I/O.
 */
export function buildAdoptionIndicators(
  signals: Partial<AdoptionSignals> | null | undefined,
): AdoptionIndicator[] {
  const s: AdoptionSignals = {
    hasUploadedData: false,
    dataQualityReviewed: false,
    prioritiesCreated: false,
    coachingVisible: false,
    roiViewed: false,
    pilotSummaryReady: false,
    serverActivityVisible: false,
    ...(signals ?? {}),
  };
  const ok = (v: boolean): AdoptionStatus => (v ? "ok" : "missing");
  return [
    { id: "hasUploadedData", label: "Data uploaded", status: ok(s.hasUploadedData), detail: s.hasUploadedData ? "POS / labour data is present for this venue." : "No imported shifts yet — start in Imports." },
    { id: "dataQualityReviewed", label: "Data quality reviewed", status: ok(s.dataQualityReviewed), detail: s.dataQualityReviewed ? "Data confidence is acceptable for coaching decisions." : "Resolve identity warnings and confirm bases before reviewing people." },
    { id: "prioritiesCreated", label: "Priorities created", status: ok(s.prioritiesCreated), detail: s.prioritiesCreated ? "At least one weekly priority is in flight." : "Approve the first weekly priority for this venue." },
    { id: "coachingVisible", label: "Coaching visible", status: ok(s.coachingVisible), detail: s.coachingVisible ? "Coaching is reaching servers." : "No coaching items yet — approve priorities so servers see them." },
    { id: "roiViewed", label: "ROI viewed", status: ok(s.roiViewed), detail: s.roiViewed ? "Enterprise ROI has been opened for this venue." : "Open Enterprise ROI before your leadership review." },
    { id: "pilotSummaryReady", label: "Pilot summary ready", status: ok(s.pilotSummaryReady), detail: s.pilotSummaryReady ? "Pilot readiness has been opened and is exportable." : "Open Pilot Readiness and export the leadership summary." },
    { id: "serverActivityVisible", label: "Server activity visible", status: ok(s.serverActivityVisible), detail: s.serverActivityVisible ? "Servers have logged in recently." : "No recent server logins observed — share the server invite link." },
  ];
}
