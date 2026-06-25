// Phase 18 — Row-level provenance & evidence persistence
import { describe, it, expect } from "vitest";
import {
  buildShiftProvenance,
  buildRecommendationEvidence,
  recommendationConfidence,
  deriveReliabilityClass,
  calculationSafety,
} from "@/lib/provenance";

describe("Phase 18: shift provenance", () => {
  it("preserves committed POS metadata", () => {
    const p = buildShiftProvenance({
      source_system: "toast",
      source_batch_id: "b1",
      source_row_id: "r1",
      sales_basis: "net",
      labor_basis: "wages_only",
      reliability_class: "measured",
      identity_match_method: "exact_id",
      identity_match_confidence: 1,
      imported_at: "2026-06-25T10:00:00Z",
    });
    expect(p.sales_basis).toBe("net");
    expect(p.labor_basis).toBe("wages_only");
    expect(p.source_batch_id).toBe("b1");
    expect(p.identity_match_method).toBe("exact_id");
  });

  it("flags gross-used-as-net as estimated with warning safety", () => {
    const cls = deriveReliabilityClass({
      sales_basis: "gross_as_net_estimated",
      labor_basis: "wages_only",
      identity_match_confidence: 1,
    });
    expect(cls).toBe("estimated");
    expect(calculationSafety(cls)).toBe("warning");
  });

  it("flags unknown labour basis as estimated", () => {
    const cls = deriveReliabilityClass({
      sales_basis: "net",
      labor_basis: "unknown_estimated",
      identity_match_confidence: 1,
    });
    expect(cls).toBe("estimated");
  });

  it("marks ambiguous identity as untrusted/blocked safety", () => {
    const cls = deriveReliabilityClass({
      sales_basis: "net",
      labor_basis: "wages_only",
      ambiguous_identity: true,
    });
    expect(cls).toBe("untrusted");
    expect(calculationSafety(cls)).toBe("blocked");
  });

  it("drops empty keys to keep persisted JSON small", () => {
    const p = buildShiftProvenance({ source_system: "toast", warnings: [] });
    expect(Object.keys(p)).toEqual(["source_system"]);
  });
});

describe("Phase 18: recommendation evidence", () => {
  it("persists based_on, excluded contextual and source metrics", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["pos_item_sales", "check_totals", "menu_category"],
      excluded_contextual_fields: ["sevenrooms_section"],
      source_metrics: { wine_attach_rate: 0.12 },
      explanation_basis: "POS-driven",
    });
    expect(ev.based_on).toContain("pos_item_sales");
    expect(ev.excluded_contextual_fields).toContain("sevenrooms_section");
    expect(ev.source_metrics?.wine_attach_rate).toBe(0.12);
    expect(recommendationConfidence(ev)).toBe("high");
  });

  it("rejects evidence that promotes contextual into based_on", () => {
    expect(() =>
      buildRecommendationEvidence({
        based_on: ["sevenrooms_section"],
        excluded_contextual_fields: ["sevenrooms_section"],
      }),
    ).toThrow(/contextual\/blocked/);
  });

  it("returns blocked confidence when fields are blocked", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["pos_item_sales"],
      blocked_fields: ["ambiguous_identity"],
    });
    expect(recommendationConfidence(ev)).toBe("blocked");
  });

  it("returns blocked confidence when based_on is empty", () => {
    const ev = buildRecommendationEvidence({ based_on: [] });
    expect(recommendationConfidence(ev)).toBe("blocked");
  });

  it("returns low confidence when single based_on with estimated inputs", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["labour_cost"],
      estimated_inputs: ["labour_cost"],
    });
    expect(recommendationConfidence(ev)).toBe("low");
  });

  it("returns medium confidence with mixed measured + estimated", () => {
    const ev = buildRecommendationEvidence({
      based_on: ["pos_item_sales", "labour_cost"],
      estimated_inputs: ["labour_cost"],
    });
    expect(recommendationConfidence(ev)).toBe("medium");
  });
});
