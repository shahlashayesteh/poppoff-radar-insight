/**
 * Phase 17 — Data Source Reliability Framework
 *
 * Proves that hard POS / labour facts are kept strictly separated from
 * contextual signals, that unverified section / reservation data cannot
 * power confident scoring, and that estimated values surface a warning.
 */
import { describe, expect, it } from "vitest";
import {
  FIELD_REGISTRY,
  buildRecommendationEvidence,
  canUseForContext,
  canUseForScoring,
  classifyFieldReliability,
  getReliabilityLabel,
  requiresWarning,
} from "@/lib/data-reliability";

describe("Phase 17 — field classification", () => {
  it("classifies POS item sold as measured / high-confidence", () => {
    const e = classifyFieldReliability("pos_item_sold");
    expect(e.reliability).toBe("measured");
    expect(e.source).toBe("pos");
    expect(canUseForScoring(e)).toBe(true);
    expect(requiresWarning(e)).toBe(false);
  });

  it("POS server ID is measured but requires identity match validation", () => {
    const e = FIELD_REGISTRY.pos_server_id;
    expect(e.reliability).toBe("measured");
    expect(e.requiresVerification).toBe(true);
  });

  it("RPC is derived and may feed scoring", () => {
    const e = FIELD_REGISTRY.rpc;
    expect(e.reliability).toBe("derived");
    expect(canUseForScoring(e)).toBe(true);
  });

  it("gross-used-as-net is estimated and requires a warning", () => {
    const e = FIELD_REGISTRY.gross_used_as_net;
    expect(e.reliability).toBe("estimated");
    expect(requiresWarning(e)).toBe(true);
    // Estimated never feeds scoring silently.
    expect(canUseForScoring(e)).toBe(false);
    expect(canUseForScoring(e, { allowEstimatedWithWarning: true })).toBe(
      true,
    );
  });

  it("rota scheduled section is contextual, not measured", () => {
    const e = classifyFieldReliability("section", "rota");
    expect(e.reliability).toBe("contextual");
    expect(canUseForScoring(e)).toBe(false);
    expect(canUseForContext(e)).toBe(true);
  });

  it("SevenRooms section is contextual unless explicitly verified", () => {
    const e = classifyFieldReliability("section", "reservation");
    expect(e.reliability).toBe("contextual");
    expect(e.requiresVerification).toBe(true);
    expect(canUseForScoring(e)).toBe(false);
    expect(canUseForScoring(e, { verified: true })).toBe(true);
  });

  it("unverified section cannot feed section-performance scoring", () => {
    const e = FIELD_REGISTRY.unverified_section;
    expect(e.reliability).toBe("untrusted");
    expect(canUseForScoring(e)).toBe(false);
    expect(canUseForScoring(e, { verified: true })).toBe(false);
  });

  it("missing server ID blocks server-level scoring", () => {
    const e = FIELD_REGISTRY.missing_server_id;
    expect(canUseForScoring(e)).toBe(false);
    expect(e.safety).toBe("excluded");
  });

  it("duplicate name without confirmed identity blocks confident scoring", () => {
    const e = FIELD_REGISTRY.duplicate_name_no_identity;
    expect(canUseForScoring(e)).toBe(false);
  });

  it("unknown labour basis surfaces a warning", () => {
    const e = FIELD_REGISTRY.labour_wage_cost_unknown_basis;
    expect(requiresWarning(e)).toBe(true);
  });

  it("unknown fields default to untrusted / excluded", () => {
    const e = classifyFieldReliability("totally_made_up_field");
    expect(e.reliability).toBe("untrusted");
    expect(canUseForScoring(e)).toBe(false);
  });

  it("getReliabilityLabel returns a human label", () => {
    expect(getReliabilityLabel("pos_item_sold")).toBe("Measured");
    expect(getReliabilityLabel("gross_used_as_net")).toBe("Estimated");
  });
});

describe("Phase 17 — recommendation evidence", () => {
  it("hard POS + derived fields → high confidence, no warning", () => {
    const ev = buildRecommendationEvidence([
      "pos_item_sold",
      "pos_check_total",
      "rpc",
    ]);
    expect(ev.confidence).toBe("high");
    expect(ev.hasWarning).toBe(false);
    expect(ev.isBlocked).toBe(false);
  });

  it("estimated input → medium confidence with warning", () => {
    const ev = buildRecommendationEvidence([
      "pos_item_sold",
      "gross_used_as_net",
    ]);
    expect(ev.confidence).toBe("medium");
    expect(ev.hasWarning).toBe(true);
  });

  it("contextual rota section alone → low confidence", () => {
    const ev = buildRecommendationEvidence(["rota_scheduled_section"]);
    expect(ev.confidence).toBe("low");
  });

  it("untrusted input → blocked", () => {
    const ev = buildRecommendationEvidence([
      "pos_item_sold",
      "unverified_section",
    ]);
    expect(ev.confidence).toBe("blocked");
    expect(ev.isBlocked).toBe(true);
  });

  it("evidence exposes the field registry entries for UI display", () => {
    const ev = buildRecommendationEvidence(["pos_item_sold", "rpc"]);
    expect(ev.fields.map((f) => f.field)).toEqual(["pos_item_sold", "rpc"]);
  });
});
