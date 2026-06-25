// Phase 12 — Entitlement logic tests.
import { describe, it, expect } from "vitest";
import {
  normaliseStatus,
  canAccessPaidManagerFeatures,
  canImportProductionData,
  shouldShowPastDueWarning,
  statusLabel,
} from "@/lib/entitlements";

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

describe("entitlements.normaliseStatus", () => {
  it("maps stripe statuses to canonical enum", () => {
    expect(normaliseStatus({ status: "active" })).toBe("active");
    expect(normaliseStatus({ status: "trialing" })).toBe("trialing");
    expect(normaliseStatus({ status: "past_due" })).toBe("past_due");
    expect(normaliseStatus({ status: "unpaid" })).toBe("expired");
    expect(normaliseStatus({ status: "incomplete_expired" })).toBe("expired");
    expect(normaliseStatus({ status: "paused" })).toBe("expired");
  });

  it("treats cancelled with future period_end as cancelled (grace)", () => {
    expect(normaliseStatus({ status: "canceled", currentPeriodEnd: future() })).toBe("cancelled");
  });

  it("treats cancelled with past period_end as expired", () => {
    expect(normaliseStatus({ status: "canceled", currentPeriodEnd: past() })).toBe("expired");
  });

  it("falls back to unknown on missing / unrecognised statuses", () => {
    expect(normaliseStatus({ status: null })).toBe("unknown");
    expect(normaliseStatus({ status: "wat" })).toBe("unknown");
  });
});

describe("entitlements gates", () => {
  it("active, trialing, enterprise can access paid manager features", () => {
    expect(canAccessPaidManagerFeatures("active")).toBe(true);
    expect(canAccessPaidManagerFeatures("trialing")).toBe(true);
    expect(canAccessPaidManagerFeatures("enterprise")).toBe(true);
  });

  it("past_due, cancelled, expired, unknown are blocked from paid features", () => {
    expect(canAccessPaidManagerFeatures("past_due")).toBe(false);
    expect(canAccessPaidManagerFeatures("cancelled")).toBe(false);
    expect(canAccessPaidManagerFeatures("expired")).toBe(false);
    expect(canAccessPaidManagerFeatures("unknown")).toBe(false);
  });

  it("cancelled and expired cannot import production data", () => {
    expect(canImportProductionData("cancelled")).toBe(false);
    expect(canImportProductionData("expired")).toBe(false);
    expect(canImportProductionData("unknown")).toBe(false);
  });

  it("active / trialing / enterprise can import production data", () => {
    expect(canImportProductionData("active")).toBe(true);
    expect(canImportProductionData("trialing")).toBe(true);
    expect(canImportProductionData("enterprise")).toBe(true);
  });

  it("past_due triggers warning banner", () => {
    expect(shouldShowPastDueWarning("past_due")).toBe(true);
    expect(shouldShowPastDueWarning("active")).toBe(false);
  });

  it("statusLabel produces human strings", () => {
    expect(statusLabel("active")).toMatch(/active/i);
    expect(statusLabel("cancelled")).toMatch(/cancelled|grace/i);
    expect(statusLabel("unknown")).toMatch(/no subscription/i);
  });
});
