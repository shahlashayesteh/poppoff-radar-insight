// Identity resolution priority order.
// 1) reliable imported employee ID
// 2) confirmed venue identity mapping
// 3) exact confirmed alias
// 4) exact normalised existing identity name
// 5) fuzzy candidate (manager review required — NEVER auto-merge)
// 6) new synthetic identity ('new_unverified') only when no credible match exists.
export type IdentityStatus = "resolved" | "pending" | "new_unverified" | "conflict";

export interface IdentityResolution {
  identity_id: string | null;
  method:
    | "employee_id"
    | "confirmed_mapping"
    | "confirmed_alias"
    | "exact_normalised_name"
    | "fuzzy_pending"
    | "new_synthetic"
    | "none";
  identity_status: IdentityStatus;
  confidence: number;
}

export function normaliseName(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ResolveContext {
  byEmployeeId: Map<string, string>;
  confirmedMappings: Map<string, string>;
  aliases: Map<string, string>;
  canonicalByName: Map<string, string>;
  fuzzyCandidate?: (name: string) => string | null;
}

export function resolveIdentity(
  reported: { id?: string | null; name?: string | null },
  ctx: ResolveContext,
): IdentityResolution {
  const id = reported.id?.trim() || "";
  const nm = normaliseName(reported.name);
  if (id && ctx.byEmployeeId.has(id))
    return { identity_id: ctx.byEmployeeId.get(id)!, method: "employee_id", identity_status: "resolved", confidence: 1.0 };
  if (id && ctx.confirmedMappings.has(id))
    return { identity_id: ctx.confirmedMappings.get(id)!, method: "confirmed_mapping", identity_status: "resolved", confidence: 0.95 };
  if (nm && ctx.aliases.has(nm))
    return { identity_id: ctx.aliases.get(nm)!, method: "confirmed_alias", identity_status: "resolved", confidence: 0.95 };
  if (nm && ctx.canonicalByName.has(nm))
    return { identity_id: ctx.canonicalByName.get(nm)!, method: "exact_normalised_name", identity_status: "resolved", confidence: 0.9 };
  if (nm && ctx.fuzzyCandidate) {
    const c = ctx.fuzzyCandidate(nm);
    if (c) return { identity_id: c, method: "fuzzy_pending", identity_status: "pending", confidence: 0.5 };
  }
  return { identity_id: null, method: "new_synthetic", identity_status: "new_unverified", confidence: 0.3 };
}
