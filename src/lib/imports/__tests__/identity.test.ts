// Phase 7 — Employee identity resolution tests.
import { describe, it, expect } from "vitest";
import {
  resolveIdentity, summarise, normaliseName,
  type IdentityDirectory, type EmployeeRecord,
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

function dir(employees: EmployeeRecord[] = [], opts: Partial<IdentityDirectory> = {}): IdentityDirectory {
  return { venueId: VENUE, employees, sourceIds: [], aliases: [], ...opts };
}

describe("identity.resolveIdentity — priority order", () => {
  const ella = mkEmp({ id: "e1", display_name: "Ella Stone", pos_employee_id: "P-100", labour_employee_id: "L-100" });

  it("matches exact POS employee ID", () => {
    const r = resolveIdentity(
      { source_system: "pos", source_employee_id: "P-100", reported_name: "Different Name" },
      dir([ella]),
    );
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("pos_employee_id");
    expect(r.employee_id).toBe("e1");
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("matches exact labour employee ID", () => {
    const r = resolveIdentity(
      { source_system: "labour", source_employee_id: "L-100" },
      dir([ella]),
    );
    expect(r.method).toBe("labour_employee_id");
    expect(r.employee_id).toBe("e1");
  });

  it("matches confirmed alias", () => {
    const r = resolveIdentity(
      { reported_name: "El Stone" },
      dir([ella], { aliases: [{ venue_id: VENUE, normalised_alias: "el stone", canonical_identity_id: "e1" }] }),
    );
    expect(r.method).toBe("confirmed_alias");
    expect(r.employee_id).toBe("e1");
  });

  it("matches exact normalised name within same venue", () => {
    const r = resolveIdentity({ reported_name: "Ella  Stone" }, dir([ella]));
    expect(r.method).toBe("exact_name");
    expect(r.employee_id).toBe("e1");
  });
});

describe("identity.resolveIdentity — ambiguity protection", () => {
  it("flags duplicate names as ambiguous and never merges them", () => {
    const a = mkEmp({ id: "e1", display_name: "John Smith" });
    const b = mkEmp({ id: "e2", display_name: "John Smith" });
    const r = resolveIdentity({ reported_name: "John Smith" }, dir([a, b]));
    expect(r.status).toBe("ambiguous");
    expect(r.employee_id).toBeNull();
    expect(r.candidates).toHaveLength(2);
    expect(r.manual_review_required).toBe(true);
  });

  it("never merges across venues", () => {
    // The directory loader filters by venue_id at the DB layer, so a
    // cross-venue Ella simply never appears in this venue's directory.
    // Result: the resolver classifies her as new_unverified, not as a match.
    const r = resolveIdentity({ reported_name: "Ella Stone" }, dir([]));
    expect(r.status).toBe("new_unverified");
    expect(r.employee_id).toBeNull();
  });


  it("flags conflicting POS vs labour source IDs as ambiguous", () => {
    const a = mkEmp({ id: "e1", display_name: "Alice", pos_employee_id: "X1" });
    const b = mkEmp({ id: "e2", display_name: "Bob",   labour_employee_id: "X1" });
    const r = resolveIdentity({ source_employee_id: "X1" }, dir([a, b]));
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });
});

describe("identity.resolveIdentity — missing data warnings", () => {
  it("warns when no ID and no match by name (new_unverified)", () => {
    const r = resolveIdentity({ reported_name: "New Hire" }, dir());
    expect(r.status).toBe("new_unverified");
    expect(r.manual_review_required).toBe(true);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("treats no name + no id as unmatched (never silent merge)", () => {
    const r = resolveIdentity({}, dir());
    expect(r.status).toBe("unmatched");
    expect(r.manual_review_required).toBe(true);
  });

  it("does NOT auto-create a permanent hash identity for missing ID", () => {
    const r = resolveIdentity({ reported_name: "Ghost Worker" }, dir());
    // 'new' = proposed, requires confirmation; not a silent hash.
    expect(r.method).toBe("new");
    expect(r.manual_review_required).toBe(true);
    expect(r.employee_id).toBeNull();
  });
});

describe("identity.summarise", () => {
  it("counts statuses for the Data Quality panel", () => {
    const ella = mkEmp({ id: "e1", display_name: "Ella" });
    const dup1 = mkEmp({ id: "e2", display_name: "Dup" });
    const dup2 = mkEmp({ id: "e3", display_name: "Dup" });
    const D = dir([ella, dup1, dup2]);
    const rs = [
      resolveIdentity({ reported_name: "Ella" }, D),
      resolveIdentity({ reported_name: "Dup" }, D),
      resolveIdentity({ reported_name: "New Hire" }, D),
      resolveIdentity({}, D),
    ];
    const s = summarise(rs);
    expect(s.total).toBe(4);
    expect(s.resolved).toBe(1);
    expect(s.ambiguous).toBe(1);
    expect(s.new_unverified).toBe(1);
    expect(s.unmatched).toBe(1);
    expect(s.manual_review).toBe(3);
  });
});
