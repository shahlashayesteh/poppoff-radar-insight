/**
 * Phase 17B — Reliability Framework Integration & Evidence Labels
 *
 * Verifies that the reliability framework is consumed by real product
 * surfaces (basis mapping helpers, evidence components and the
 * canonical → reliability bridge), not only the Phase 17 registry tests.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  reliabilityKeyForCanonical,
  CANONICAL_TO_RELIABILITY,
} from "@/lib/canonical-to-reliability";
import {
  classifyFieldReliability,
  buildRecommendationEvidence,
  canUseForScoring,
} from "@/lib/data-reliability";
import { ReliabilityBadge } from "@/components/reliability/reliability-badge";
import { EvidenceBasis } from "@/components/reliability/evidence-basis";

describe("Phase 17B — Canonical → reliability bridge", () => {
  it("maps measured POS fields to measured registry entries", () => {
    const e = classifyFieldReliability(reliabilityKeyForCanonical("gross_sales"));
    expect(e.reliability).toBe("measured");
  });

  it("maps menu_item to measured pos_item_sold", () => {
    expect(reliabilityKeyForCanonical("menu_item")).toBe("pos_item_sold");
    expect(classifyFieldReliability("pos_item_sold").reliability).toBe("measured");
  });

  it("maps scheduled_hours to contextual rota_scheduled_shift", () => {
    const e = classifyFieldReliability(
      reliabilityKeyForCanonical("scheduled_hours"),
    );
    expect(e.reliability).toBe("contextual");
  });

  it("server_name alone is untrusted until identity is confirmed", () => {
    const e = classifyFieldReliability(reliabilityKeyForCanonical("server_name"));
    expect(e.reliability).toBe("untrusted");
    expect(canUseForScoring(e)).toBe(false);
  });

  it("covers a useful breadth of canonical fields", () => {
    expect(Object.keys(CANONICAL_TO_RELIABILITY).length).toBeGreaterThan(20);
  });
});

describe("Phase 17B — ReliabilityBadge renders class labels", () => {
  it("renders Measured for hard POS facts", () => {
    const html = renderToStaticMarkup(
      <ReliabilityBadge field="pos_check_total" />,
    );
    expect(html).toContain('data-reliability="measured"');
    expect(html).toContain("Measured");
  });

  it("renders Estimated + warning icon for gross_used_as_net", () => {
    const html = renderToStaticMarkup(
      <ReliabilityBadge field="gross_used_as_net" />,
    );
    expect(html).toContain('data-reliability="estimated"');
    expect(html).toContain("Estimated");
    expect(html).toContain('data-testid="reliability-warning-icon"');
  });

  it("renders Context only for unverified sections", () => {
    const html = renderToStaticMarkup(
      <ReliabilityBadge field="sevenrooms_section" />,
    );
    expect(html).toContain('data-reliability="contextual"');
    expect(html).toContain("Context only");
  });

  it("renders Blocked for untrusted fields", () => {
    const html = renderToStaticMarkup(
      <ReliabilityBadge field="missing_server_id" />,
    );
    expect(html).toContain('data-reliability="untrusted"');
    expect(html).toContain("Blocked");
  });
});

describe("Phase 17B — EvidenceBasis exposes Based on / Not used / Blocked", () => {
  it("lists measured fields under Based on and contextual under Not used", () => {
    const html = renderToStaticMarkup(
      <EvidenceBasis
        fields={["pos_item_sold", "pos_check_total", "sevenrooms_section"]}
      />,
    );
    expect(html).toContain('data-confidence="low"');
    expect(html).toContain("Based on:");
    expect(html).toContain("POS item sold");
    expect(html).toContain("Not used for scoring:");
    expect(html).toContain("SevenRooms section");
  });

  it("flags estimated inputs with a warning and medium confidence", () => {
    const html = renderToStaticMarkup(
      <EvidenceBasis fields={["pos_item_sold", "gross_used_as_net"]} />,
    );
    expect(html).toContain('data-confidence="medium"');
    expect(html).toContain("Estimated input");
  });

  it("blocks recommendations when any untrusted field is present", () => {
    const html = renderToStaticMarkup(
      <EvidenceBasis fields={["pos_item_sold", "missing_server_id"]} />,
    );
    expect(html).toContain('data-blocked="true"');
    expect(html).toContain('data-confidence="blocked"');
  });

  it("compact mode renders the confidence chip only", () => {
    const html = renderToStaticMarkup(
      <EvidenceBasis compact fields={["pos_item_sold", "pos_check_total"]} />,
    );
    expect(html).toContain('data-testid="evidence-basis-compact"');
    expect(html).not.toContain('data-testid="evidence-basis"');
  });
});

describe("Phase 17B — Recommendation evidence safety rules", () => {
  it("POS item sales + check totals + labour hours = high confidence", () => {
    const ev = buildRecommendationEvidence([
      "pos_item_sold",
      "pos_check_total",
      "labour_paid_hours",
    ]);
    expect(ev.confidence).toBe("high");
    expect(ev.isBlocked).toBe(false);
  });

  it("unverified section data is excluded from confident scoring", () => {
    expect(canUseForScoring("sevenrooms_section")).toBe(false);
    expect(canUseForScoring("sevenrooms_section", { verified: true })).toBe(true);
  });

  it("RPC is derived and Base LLS is derived", () => {
    expect(classifyFieldReliability("rpc").reliability).toBe("derived");
    expect(classifyFieldReliability("lls_base").reliability).toBe("derived");
  });
});
