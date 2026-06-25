// Phase 11 — Menu Intelligence, Weekly Priorities and Coaching workflow.
// Static-source assertions to lock in the approval workflow contract.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SERVER_COACHING = "src/routes/server.coaching.tsx";
const MANAGER_PRIORITIES = "src/routes/manager.priorities.tsx";
const MANAGER_MENU = "src/routes/manager.menu.tsx";
const MANAGER_COACHING = "src/routes/manager.coaching.tsx";

function read(p: string): string { return readFileSync(p, "utf8"); }

describe("Phase 11 — server coaching only consumes approved/sent priorities", () => {
  const body = read(SERVER_COACHING);
  it("explicitly filters weekly_priorities by status in (approved, sent_to_servers)", () => {
    expect(body).toMatch(/\.in\(\s*["']status["']\s*,\s*\[\s*["']approved["']\s*,\s*["']sent_to_servers["']\s*\]/);
  });
  it("excludes archived rows on the client", () => {
    expect(body).toMatch(/\.is\(\s*["']archived_at["']\s*,\s*null/);
  });
  it("does not mention rejected, ai_suggested, archived or margin in the server coaching surface", () => {
    expect(body).not.toMatch(/\bmargin\b/i);
    expect(body).not.toMatch(/rejected_reason/);
    expect(body).not.toMatch(/\bai_suggested\b/);
  });
  it("never references manager-only intelligence", () => {
    for (const re of [/labour cost/i, /adjusted lls/i, /opportunity factor/i, /recoverable revenue/i, /Historical Shift Match Intelligence/, /Trading Pattern Factor v1/, /\bLLS\b/]) {
      expect(body, `server coaching contains ${re}`).not.toMatch(re);
    }
  });
});

describe("Phase 11 — manager priorities approval workflow", () => {
  const body = read(MANAGER_PRIORITIES);
  it("renders status tabs for every supported status", () => {
    for (const s of ["ai_suggested", "approved", "sent_to_servers", "rejected", "archived"]) {
      expect(body).toContain(`"${s}"`);
    }
  });
  it("offers Approve, Reject, Send-to-servers and Archive transitions", () => {
    expect(body).toMatch(/Approve/);
    expect(body).toMatch(/Reject/);
    expect(body).toMatch(/Send to servers/);
    expect(body).toMatch(/Archive/);
  });
  it("logs audit events on transitions", () => {
    expect(body).toMatch(/menu_intelligence_audit_events/);
    expect(body).toMatch(/logAudit/);
  });
  it("labels expected impact as modelled and negates any 'guaranteed revenue' claim", () => {
    expect(body).toMatch(/modelled/i);
    const sentences = body.match(/[^.]*guaranteed revenue[^.]*\./gi) ?? [];
    for (const s of sentences) expect(s.toLowerCase()).toMatch(/not|never|no /);
  });
});

describe("Phase 11 — manager menu suggestions workflow", () => {
  const body = read(MANAGER_MENU);
  it("loads menu_item_suggestions and exposes status tabs", () => {
    expect(body).toContain('"menu_item_suggestions"');
    expect(body).toMatch(/suggestionTab/);
  });
  it("supports stage-from-menu, approve, reject, send, archive", () => {
    expect(body).toMatch(/stageParsedItemsForReview/);
    expect(body).toMatch(/transitionSug/);
    expect(body).toMatch(/Approve/);
    expect(body).toMatch(/Reject/);
    expect(body).toMatch(/Send to servers/);
    expect(body).toMatch(/Archive/);
  });
  it("labels margin as manager-only", () => {
    expect(body).toMatch(/manager-only/i);
    expect(body).toMatch(/margin/i);
  });
  it("writes a weekly_priority on send-to-servers", () => {
    expect(body).toMatch(/source_suggestion_id/);
    expect(body).toMatch(/weekly_priorities/);
  });
  it("logs audit events for menu suggestion transitions", () => {
    expect(body).toMatch(/menu_intelligence_audit_events/);
    expect(body).toMatch(/logSugAudit/);
  });
});

describe("Phase 11 — manager coaching surfaces workflow status", () => {
  const body = read(MANAGER_COACHING);
  it("counts priorities by status (sent, approved, pending, rejected, archived)", () => {
    for (const s of ["sent_to_servers", "approved", "ai_suggested", "rejected", "archived"]) {
      expect(body).toContain(`"${s}"`);
    }
  });
  it("calls out what servers can see right now and what still needs approval", () => {
    expect(body).toMatch(/servers can see/i);
    expect(body).toMatch(/needs your approval/i);
  });
  it("labels expected impact as modelled and negates any 'guaranteed revenue' claim", () => {
    expect(body).toMatch(/modelled/i);
    const sentences = body.match(/[^.]*guaranteed revenue[^.]*\./gi) ?? [];
    for (const s of sentences) expect(s.toLowerCase()).toMatch(/not|never|no /);
  });
});

describe("Phase 11 — server coaching never imports manager workflow surfaces", () => {
  const body = read(SERVER_COACHING);
  it("does not import menu suggestions or audit events on the server side", () => {
    expect(body).not.toMatch(/menu_item_suggestions/);
    expect(body).not.toMatch(/menu_intelligence_audit_events/);
  });
});
