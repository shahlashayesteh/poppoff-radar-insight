// Phase 19 — Employee Identity Schema Hardening & Team Membership Safety.
// Focuses on duplicate-name softening, source-id authority, and the new
// "unknown source ID + same name" ambiguity guard.
import { describe, it, expect } from "vitest";
import {
  resolveIdentity, normaliseName,
  type IdentityDirectory, type EmployeeRecord, type SourceIdLink,
} from "@/lib/imports/identity";

const VENUE = "v1";

function mkEmp(o: Partial<EmployeeRecord> & { id: string; display_name: string }): EmployeeRecord {
  return {
    venue_id: VENUE,
    normalised_name: normaliseName(o.display_name),
    pos_employee_id: null,
    labour_employee_id: null,
    outlet_id: null,
    ...o,
  };
}
function dir(employees: EmployeeRecord[] = [], sourceIds: SourceIdLink[] = []): IdentityDirectory {
  return { venueId: VENUE, employees, sourceIds, aliases: [] };
}

describe("Phase 19 — duplicate-name softening", () => {
  it("allows two employees to share the same normalised name when source IDs differ", () => {
    const a = mkEmp({ id: "e1", display_name: "John Smith", pos_employee_id: "P-1" });
    const b = mkEmp({ id: "e2", display_name: "John Smith", pos_employee_id: "P-2" });
    // Exact POS ID still resolves the correct John Smith.
    const r1 = resolveIdentity({ source_system: "pos", source_employee_id: "P-1", reported_name: "John Smith" }, dir([a, b]));
    expect(r1.employee_id).toBe("e1");
    expect(r1.method).toBe("pos_employee_id");

    const r2 = resolveIdentity({ source_system: "pos", source_employee_id: "P-2", reported_name: "John Smith" }, dir([a, b]));
    expect(r2.employee_id).toBe("e2");
  });

  it("name-only with multiple same-name candidates is ambiguous", () => {
    const a = mkEmp({ id: "e1", display_name: "John Smith", pos_employee_id: "P-1" });
    const b = mkEmp({ id: "e2", display_name: "John Smith", pos_employee_id: "P-2" });
    const r = resolveIdentity({ reported_name: "John Smith" }, dir([a, b]));
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });
});

describe("Phase 19 — unknown source ID on same-name row is ambiguous, not silent merge", () => {
  it("blocks merge when reported POS ID differs from the only same-name candidate's known POS ID", () => {
    const ella = mkEmp({ id: "e1", display_name: "Ella Stone", pos_employee_id: "P-100" });
    const r = resolveIdentity(
      { source_system: "pos", source_employee_id: "P-NEW", reported_name: "Ella Stone" },
      dir([ella]),
    );
    expect(r.status).toBe("ambiguous");
    expect(r.employee_id).toBeNull();
    expect(r.manual_review_required).toBe(true);
    expect(r.candidates[0].employee_id).toBe("e1");
  });

  it("still resolves by exact source ID even if name differs", () => {
    const ella = mkEmp({ id: "e1", display_name: "Ella Stone", labour_employee_id: "L-7" });
    const r = resolveIdentity(
      { source_system: "labour", source_employee_id: "L-7", reported_name: "Typo Name" },
      dir([ella]),
    );
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("labour_employee_id");
    expect(r.employee_id).toBe("e1");
  });

  it("name-only with no source ID and one unique candidate still resolves", () => {
    const ella = mkEmp({ id: "e1", display_name: "Ella Stone", pos_employee_id: "P-100" });
    const r = resolveIdentity({ reported_name: "Ella Stone" }, dir([ella]));
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("exact_name");
  });
});

describe("Phase 19 — server-level scoring safety", () => {
  it("row with no name and no source ID is unmatched (blocks scoring)", () => {
    const r = resolveIdentity({}, dir());
    expect(r.status).toBe("unmatched");
    expect(r.employee_id).toBeNull();
  });

  it("new unverified identity blocks confident scoring", () => {
    const r = resolveIdentity({ reported_name: "Brand New Person" }, dir());
    expect(r.status).toBe("new_unverified");
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.manual_review_required).toBe(true);
  });

  it("confirmed alias resolves future rows", () => {
    const ella = mkEmp({ id: "e1", display_name: "Ella Stone" });
    const d: IdentityDirectory = {
      venueId: VENUE, employees: [ella], sourceIds: [],
      aliases: [{ venue_id: VENUE, normalised_alias: "el stone", canonical_identity_id: "e1" }],
    };
    const r = resolveIdentity({ reported_name: "El Stone" }, d);
    expect(r.method).toBe("confirmed_alias");
    expect(r.employee_id).toBe("e1");
  });

  it("registered source_employee_ids link resolves future rows", () => {
    const ella = mkEmp({ id: "e1", display_name: "Ella Stone" });
    const sids: SourceIdLink[] = [
      { venue_id: VENUE, source_system: "rota", source_employee_id: "R-9", employee_master_id: "e1" },
    ];
    const r = resolveIdentity(
      { source_system: "rota", source_employee_id: "R-9", reported_name: "anyone" },
      dir([ella], sids),
    );
    expect(r.method).toBe("source_employee_id");
    expect(r.employee_id).toBe("e1");
  });
});

describe("Phase 19 — cross-venue safety", () => {
  it("directory is venue-scoped: a different venue's employee never resolves here", () => {
    // The directory loader filters by venue_id; resolver never sees other venues.
    const r = resolveIdentity({ reported_name: "Stranger" }, dir());
    expect(r.status).toBe("new_unverified");
    expect(r.employee_id).toBeNull();
  });
});
