/**
 * Phase 17B — Reliability Framework Integration & Evidence Labels
 *
 * These tests verify that the reliability framework is consumed by real
 * product surfaces (basis mapping helpers, evidence components and the
 * canonical → reliability bridge), not only the registry tests in Phase 17.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
    const e = classifyFieldReliability("pos_item_sold");
    expect(e.reliability).toBe("measured");
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

  it("covers known canonical fields", () => {
    const keys = Object.keys(CANONICAL_TO_RELIABILITY);
    expect(keys.length).toBeGreaterThan(20);
  });
});

describe("Phase 17B — ReliabilityBadge renders class labels", () => {
  it("renders Measured for hard POS facts", () => {
    const { getByTestId } = render(<ReliabilityBadge field="pos_check_total" />);
    const badge = getByTestId("reliability-badge");
    expect(badge.getAttribute("data-reliability")).toBe("measured");
    expect(badge.textContent).toContain("Measured");
  });

  it("renders Estimated + warning icon for gross_used_as_net", () => {
    const { getByTestId, queryByTestId } = render(
      <ReliabilityBadge field="gross_used_as_net" />,
    );
    const badge = getByTestId("reliability-badge");
    expect(badge.getAttribute("data-reliability")).toBe("estimated");
    expect(badge.textContent).toContain("Estimated");
    expect(queryByTestId("reliability-warning-icon")).not.toBeNull();
  });

  it("renders Context only for unverified sections", () => {
    const { getByTestId } = render(
      <ReliabilityBadge field="sevenrooms_section" />,
    );
    const badge = getByTestId("reliability-badge");
    expect(badge.getAttribute("data-reliability")).toBe("contextual");
    expect(badge.textContent).toContain("Context only");
  });

  it("renders Blocked for untrusted fields", () => {
    const { getByTestId } = render(
      <ReliabilityBadge field="missing_server_id" />,
    );
    const badge = getByTestId("reliability-badge");
    expect(badge.getAttribute("data-reliability")).toBe("untrusted");
    expect(badge.textContent).toContain("Blocked");
  });
});

describe("Phase 17B — EvidenceBasis exposes Based on / Not used / Blocked", () => {
  it("lists measured fields under Based on and contextual under Not used", () => {
    const { getByTestId } = render(
      <EvidenceBasis
        fields={["pos_item_sold", "pos_check_total", "sevenrooms_section"]}
      />,
    );
    const root = getByTestId("evidence-basis");
    expect(root.getAttribute("data-confidence")).toBe("low");
    expect(root.textContent).toContain("Based on:");
    expect(root.textContent).toContain("POS item sold");
    expect(root.textContent).toContain("Not used for scoring:");
    expect(root.textContent).toContain("SevenRooms section");
  });

  it("flags estimated inputs with a warning and medium confidence", () => {
    const { getByTestId } = render(
      <EvidenceBasis fields={["pos_item_sold", "gross_used_as_net"]} />,
    );
    const root = getByTestId("evidence-basis");
    expect(root.getAttribute("data-confidence")).toBe("medium");
    expect(root.textContent).toContain("Estimated input — review:");
  });

  it("blocks recommendations when any untrusted field is present", () => {
    const { getByTestId } = render(
      <EvidenceBasis fields={["pos_item_sold", "missing_server_id"]} />,
    );
    const root = getByTestId("evidence-basis");
    expect(root.getAttribute("data-blocked")).toBe("true");
    expect(root.getAttribute("data-confidence")).toBe("blocked");
  });

  it("compact mode renders the confidence chip only", () => {
    const { getByTestId, queryByTestId } = render(
      <EvidenceBasis compact fields={["pos_item_sold", "pos_check_total"]} />,
    );
    expect(getByTestId("evidence-basis-compact")).not.toBeNull();
    expect(queryByTestId("evidence-basis")).toBeNull();
  });
});

describe("Phase 17B — Recommendation evidence safety rules", () => {
  it("recommendation evidence with only POS item sales and check totals is high confidence", () => {
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

  it("RPC is derived from sales and covers", () => {
    expect(classifyFieldReliability("rpc").reliability).toBe("derived");
  });

  it("Base LLS is derived", () => {
    expect(classifyFieldReliability("lls_base").reliability).toBe("derived");
  });
});
