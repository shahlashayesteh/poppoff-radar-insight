/**
 * PoppOff canonical calculation engine — single source of truth.
 *
 * Every manager-facing metric (LLS, RPH, RPC, labour %, benchmarks, gaps,
 * tips, attach rates, trends, recoverable opportunity) MUST be computed
 * via this module. Pages that previously inlined formulas are being
 * migrated; do not add new inline calculations.
 *
 * Hard rules enforced here:
 *   - RPC is never multiplied into LLS.
 *   - Opportunity Factor is applied at SHIFT level before aggregation.
 *   - Aggregates use weighted sums, never average-of-averages.
 *   - Benchmarks reject basis-mismatch comparisons.
 *   - Every metric carries basis + provenance + formula for tooltips.
 *
 * Server-facing routes (`/server/*`) MUST NOT import labour/LLS/benchmark
 * functions from this module — they are manager-only.
 */
export * from "./types";
export * from "./sales";
export * from "./labor";
export * from "./productivity";
export * from "./lls";
export * from "./benchmark";
export * from "./gap";
export * from "./tips";
export * from "./trend";
export * from "./recoverable";
export * from "./server-rag";

