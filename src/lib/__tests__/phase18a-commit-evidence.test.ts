// Phase 18A — Commit-path provenance + recommendation evidence write-through.
//
// These are TS-level invariants that mirror the SQL derivation in
// public.lls_v2_commit_batch and the recommendation insert sites in
// manager.priorities.tsx / manager.menu.tsx. The SQL and TS rules MUST
// agree — change them in lockstep.
import { describe, it, expect } from "vitest";
import {
  buildRecommendationEvidence,
  deriveReliabilityClass,
  calculationSafety,
  recommendationConfidence,
} from "@/lib/provenance";

// Mirror of the per-row reliability derivation inside lls_v2_commit_batch.
function deriveCommitReliability(args: {
  net_sales: number | null;
  gross_sales: number | null;
  labour_mode: "wages_only" | "wages_plus_oncosts" | "unknown" | null;
  identity_status: "resolved" | "new_unverified" | "unmatched";
  identity_confidence: number | null;
}) {
  const sales_basis =
    args.net_sales != null
      ? "net"
      : args.gross_sales != null
      ? "gross_as_net_estimated"
      : "unknown";
  const labor_basis =
    args.labour_mode === "wages_only"
      ? "wages_only"
      : args.labour_mode === "wages_plus_oncosts"
      ? "wages_plus_oncosts"
      : "unknown_estimated";
  const cls = deriveReliabilityClass({
    sales_basis: sales_basis as never,
    labor_basis: labor_basis as never,
    identity_match_confidence: args.identity_confidence,
    ambiguous_identity:
      args.identity_status === "new_unverified" || args.identity_status === "unmatched"
        ? false
        : false,
  });
  // identity overrides — match SQL
  const finalCls =
    args.identity_status === "new_unverified" || args.identity_status === "unmatched"
      ? "estimated"
      : cls;
  return { sales_basis, labor_basis, reliability_class: finalCls };
}

describe("Phase 18A: commit-path provenance derivation", () => {
  it("net sales + wages_only + resolved identity → measured / safe_for_scoring", () => {
    const r = deriveCommitReliability({
      net_sales: 100,
      gross_sales: 120,
      labour_mode: "wages_only",
      identity_status: "resolved",
      identity_confidence: 1,
    });
    expect(r.sales_basis).toBe("net");
    expect(r.labor_basis).toBe("wages_only");
    expect(r.reliability_class).toBe("measured");
    expect(calculationSafety(r.reliability_class as never)).toBe("safe_for_scoring");
  });

  it("gross-as-net persists as estimated with warning", () => {
    const r = deriveCommitReliability({
      net_sales: null,
      gross_sales: 120,
      labour_mode: "wages_only",
      identity_status: "resolved",
      identity_confidence: 1,
    });
    expect(r.sales_basis).toBe("gross_as_net_estimated");
    expect(r.reliability_class).toBe("estimated");
    expect(calculationSafety(r.reliability_class as never)).toBe("warning");
  });

  it("unknown labour basis persists as estimated", () => {
    const r = deriveCommitReliability({
      net_sales: 100,
      gross_sales: 120,
      labour_mode: "unknown",
      identity_status: "resolved",
      identity_confidence: 1,
    });
    expect(r.labor_basis).toBe("unknown_estimated");
    expect(r.reliability_class).toBe("estimated");
  });

  it("new_unverified identity downgrades to estimated even when bases are clean", () => {
    const r = deriveCommitReliability({
      net_sales: 100,
      gross_sales: 120,
      labour_mode: "wages_only",
      identity_status: "new_unverified",
      identity_confidence: 0.9,
    });
    expect(r.reliability_class).toBe("estimated");
  });

  it("low identity confidence (<0.5) is estimated", () => {
    const r = deriveCommitReliability({
      net_sales: 100,
      gross_sales: 120,
      labour_mode: "wages_only",
      identity_status: "resolved",
      identity_confidence: 0.3,
    });
    expect(r.reliability_class).toBe("estimated");
  });
});

describe("Phase 18A: recommendation evidence write-through", () => {
  it("manager-created priority records manager_judgement basis", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["manager_judgement"],
      explanation_basis: "Manager-authored priority.",
    });
    expect(ev.based_on).toEqual(["manager_judgement"]);
    expect(recommendationConfidence(ev)).toBe("medium");
  });

  it("menu suggestion records menu_document basis and excludes sevenrooms_section", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["menu_document"],
      excluded_contextual_fields: ["sevenrooms_section"],
      source_metrics: { source_menu_id: "menu-1" },
    });
    expect(ev.based_on).toContain("menu_document");
    expect(ev.excluded_contextual_fields).toContain("sevenrooms_section");
    expect(ev.source_metrics?.source_menu_id).toBe("menu-1");
  });

  it("rejects contextual/blocked fields from based_on", () => {
    expect(() =>
      buildRecommendationEvidence({
        based_on: ["menu_document", "sevenrooms_section"],
        excluded_contextual_fields: ["sevenrooms_section"],
      }),
    ).toThrow(/based_on cannot include/);
  });

  it("two clean fields → high confidence", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["menu_document", "manager_approval"],
    });
    expect(recommendationConfidence(ev)).toBe("high");
  });
});
