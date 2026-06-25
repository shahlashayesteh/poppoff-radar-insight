// Phase 6 — Deterministic content hash for uploaded files.
// Used to detect duplicate uploads (same file_hash + venue) and to give
// each import_batch an immutable provenance fingerprint.
//
// Works in browser (Web Crypto), Node (Web Crypto polyfill), and Worker SSR.

export async function hashFileContent(content: ArrayBuffer | string): Promise<string> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  // Use Web Crypto (available in all our target runtimes)
  const subtle = (globalThis.crypto?.subtle as SubtleCrypto | undefined);
  if (!subtle) {
    // Fallback: simple FNV-1a 64-bit hex (only used in tests without WebCrypto)
    let h = 0xcbf29ce484222325n;
    for (const b of data) {
      h ^= BigInt(b);
      h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return `fnv:${h.toString(16).padStart(16, "0")}`;
  }
  const buf = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
