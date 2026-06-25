// Phase 7 — Pure employee identity resolution.
// No DB, no I/O. Deterministic given a directory snapshot. Used by the
// staged import flow to classify rows as resolved / new / ambiguous /
// unmatched without ever silently merging two distinct employees.
//
// Matching priority (highest first):
//   1. exact source-system employee ID (POS or labour)
//   2. confirmed alias on this venue
//   3. exact normalised name within the same venue
//   4. single fuzzy candidate with high confidence
//   5. multiple plausible candidates → AMBIGUOUS (manual review)
//   6. no candidate → NEW (manager confirms before commit)

export type IdentityMethod =
  | "pos_employee_id"
  | "labour_employee_id"
  | "source_employee_id"
  | "confirmed_alias"
  | "exact_name"
  | "single_candidate"
  | "ambiguous"
  | "new"
  | "unmatched";

export type IdentityStatus =
  | "resolved"
  | "ambiguous"
  | "new_unverified"
  | "unmatched"
  | "pending";

export interface EmployeeRecord {
  id: string;
  venue_id: string;
  display_name: string;
  normalised_name: string;
  pos_employee_id?: string | null;
  labour_employee_id?: string | null;
  outlet_id?: string | null;
}

export interface SourceIdLink {
  venue_id: string;
  source_system: string;       // 'pos' | 'labour' | custom
  source_employee_id: string;
  employee_master_id: string;
}

export interface AliasLink {
  venue_id: string;
  normalised_alias: string;
  canonical_identity_id: string;
}

export interface IdentityDirectory {
  venueId: string;
  employees: EmployeeRecord[];
  sourceIds: SourceIdLink[];
  aliases: AliasLink[];
}

export interface IdentityInput {
  source_system?: string | null; // 'pos' | 'labour' | ...
  source_employee_id?: string | null;
  reported_name?: string | null;
  outlet_id?: string | null;
  service_date?: string | null;
  shift_start_time?: string | null;
}

export interface IdentityResolution {
  employee_id: string | null;
  display_name: string | null;
  method: IdentityMethod;
  status: IdentityStatus;
  confidence: number;          // 0..1
  manual_review_required: boolean;
  candidates: Array<{ employee_id: string; display_name: string; reason: string }>;
  reason: string;
}

export function normaliseName(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,'`]/g, "")
    .replace(/\s+/g, " ");
}

interface Indexed {
  byPos: Map<string, EmployeeRecord>;
  byLabour: Map<string, EmployeeRecord>;
  bySourceId: Map<string, EmployeeRecord>; // key = system|id
  byAlias: Map<string, EmployeeRecord>;
  byName: Map<string, EmployeeRecord[]>;   // multiple → ambiguity surfacing
}

export function indexDirectory(dir: IdentityDirectory): Indexed {
  const byEmp = new Map<string, EmployeeRecord>();
  const byPos = new Map<string, EmployeeRecord>();
  const byLabour = new Map<string, EmployeeRecord>();
  const bySourceId = new Map<string, EmployeeRecord>();
  const byAlias = new Map<string, EmployeeRecord>();
  const byName = new Map<string, EmployeeRecord[]>();

  for (const e of dir.employees) {
    byEmp.set(e.id, e);
    if (e.pos_employee_id) byPos.set(e.pos_employee_id, e);
    if (e.labour_employee_id) byLabour.set(e.labour_employee_id, e);
    const arr = byName.get(e.normalised_name) ?? [];
    arr.push(e);
    byName.set(e.normalised_name, arr);
  }
  for (const s of dir.sourceIds) {
    const emp = byEmp.get(s.employee_master_id);
    if (emp) bySourceId.set(`${s.source_system}|${s.source_employee_id}`, emp);
  }
  for (const a of dir.aliases) {
    const emp = byEmp.get(a.canonical_identity_id);
    if (emp) byAlias.set(a.normalised_alias, emp);
  }
  return { byPos, byLabour, bySourceId, byAlias, byName };
}

export function resolveIdentity(
  input: IdentityInput,
  dir: IdentityDirectory,
): IdentityResolution {
  const idx = indexDirectory(dir);
  return resolveIdentityIndexed(input, idx);
}

export function resolveIdentityIndexed(
  input: IdentityInput,
  idx: Indexed,
): IdentityResolution {
  const sysRaw = (input.source_system ?? "").trim().toLowerCase();
  const sid = (input.source_employee_id ?? "").trim();
  const nameRaw = (input.reported_name ?? "").trim();
  const nm = normaliseName(nameRaw);

  // 1. exact source-system ID — strongest signal, never overridden by name.
  if (sid) {
    if (sysRaw && idx.bySourceId.has(`${sysRaw}|${sid}`)) {
      const emp = idx.bySourceId.get(`${sysRaw}|${sid}`)!;
      return done(emp, "source_employee_id", "resolved", 1.0, false,
        `Exact match on source system '${sysRaw}' employee ID '${sid}'.`);
    }
    if (sysRaw === "pos" && idx.byPos.has(sid)) {
      return done(idx.byPos.get(sid)!, "pos_employee_id", "resolved", 1.0, false,
        `Exact POS employee ID match.`);
    }
    if ((sysRaw === "labour" || sysRaw === "labor") && idx.byLabour.has(sid)) {
      return done(idx.byLabour.get(sid)!, "labour_employee_id", "resolved", 1.0, false,
        `Exact labour employee ID match.`);
    }
    if (!sysRaw) {
      // Unknown source — check both buckets but NEVER silently merge if both
      // buckets resolve to different employees.
      const p = idx.byPos.get(sid);
      const l = idx.byLabour.get(sid);
      if (p && l && p.id !== l.id) {
        return ambiguous([p, l],
          `Source ID '${sid}' matches two different employees (one POS, one labour).`);
      }
      const hit = p ?? l;
      if (hit) {
        return done(hit, p ? "pos_employee_id" : "labour_employee_id", "resolved", 0.95, false,
          `Source ID '${sid}' matched without an explicit system label.`);
      }
    }
  }

  // 2. confirmed alias on this venue.
  if (nm && idx.byAlias.has(nm)) {
    return done(idx.byAlias.get(nm)!, "confirmed_alias", "resolved", 0.95, false,
      `Matched a previously confirmed alias for '${nameRaw}'.`);
  }

  // 3. exact normalised name within the same venue.
  const sameName = idx.byName.get(nm) ?? [];
  if (nm && sameName.length === 1) {
    return done(sameName[0], "exact_name", "resolved", 0.9, false,
      `Exact normalised name match within venue.`);
  }
  if (nm && sameName.length > 1) {
    return ambiguous(sameName,
      `Multiple employees share the name '${nameRaw}' at this venue — manager must confirm.`);
  }

  // 4. no name and no usable ID → unmatched.
  if (!nm && !sid) {
    return {
      employee_id: null, display_name: null,
      method: "unmatched", status: "unmatched", confidence: 0,
      manual_review_required: true, candidates: [],
      reason: "Row has no server identity (no name, no ID).",
    };
  }

  // 5. name fallback with low confidence → propose NEW with explicit warning.
  // Never auto-merge across venues or silently hash an unverified identity.
  return {
    employee_id: null,
    display_name: nameRaw || null,
    method: "new",
    status: "new_unverified",
    confidence: 0.4,
    manual_review_required: true,
    candidates: [],
    reason: sid
      ? `Source ID '${sid}' is unknown to this venue; will create a new employee identity once a manager confirms.`
      : `No existing employee matched '${nameRaw}'; will create a new identity once a manager confirms.`,
  };
}

function done(
  emp: EmployeeRecord,
  method: IdentityMethod,
  status: IdentityStatus,
  confidence: number,
  manualReview: boolean,
  reason: string,
): IdentityResolution {
  return {
    employee_id: emp.id,
    display_name: emp.display_name,
    method,
    status,
    confidence,
    manual_review_required: manualReview,
    candidates: [{ employee_id: emp.id, display_name: emp.display_name, reason: method }],
    reason,
  };
}

function ambiguous(emps: EmployeeRecord[], reason: string): IdentityResolution {
  return {
    employee_id: null,
    display_name: null,
    method: "ambiguous",
    status: "ambiguous",
    confidence: 0.5,
    manual_review_required: true,
    candidates: emps.map((e) => ({
      employee_id: e.id,
      display_name: e.display_name,
      reason: "name_collision",
    })),
    reason,
  };
}

export interface IdentitySummary {
  total: number;
  resolved: number;
  ambiguous: number;
  unmatched: number;
  new_unverified: number;
  manual_review: number;
  high_confidence: number;
  low_confidence: number;
}

export function summarise(resolutions: IdentityResolution[]): IdentitySummary {
  const s: IdentitySummary = {
    total: resolutions.length,
    resolved: 0, ambiguous: 0, unmatched: 0, new_unverified: 0,
    manual_review: 0, high_confidence: 0, low_confidence: 0,
  };
  for (const r of resolutions) {
    if (r.status === "resolved") s.resolved++;
    else if (r.status === "ambiguous") s.ambiguous++;
    else if (r.status === "unmatched") s.unmatched++;
    else if (r.status === "new_unverified") s.new_unverified++;
    if (r.manual_review_required) s.manual_review++;
    if (r.confidence >= 0.9) s.high_confidence++; else s.low_confidence++;
  }
  return s;
}
