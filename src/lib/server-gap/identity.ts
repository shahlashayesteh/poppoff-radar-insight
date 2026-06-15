// Server identity resolution. ID-preferred; falls back to normalised name.

export function normName(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normId(v: unknown): string {
  return String(v ?? "").trim();
}

/** Stable per-server key. Prefers ID; falls back to normalised name. */
export function serverKey(opts: { id?: string | null; name?: string | null }): string {
  const id = normId(opts.id);
  if (id) return `id:${id}`;
  const name = normName(opts.name);
  if (name) return `nm:${name}`;
  return "";
}

/** Best display label — prefer the original (un-normalised) name, fall back to ID. */
export function serverDisplay(opts: {
  id?: string | null;
  name?: string | null;
}): string {
  const name = String(opts.name ?? "").trim();
  if (name) return name;
  const id = normId(opts.id);
  return id || "Unknown";
}
