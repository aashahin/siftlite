import type {
  ReadConsistencyCapabilities,
  RuntimeCapabilities,
  RuntimeSqlLimits,
  SearchPolicy,
} from "@siftlite/core";

/**
 * Documented D1 per-query limits as of 2026-08-16
 * (https://developers.cloudflare.com/d1/platform/limits/).
 *
 * These are adapter-owned runtime data, not core constants.
 */
export const D1_SQL_LIMITS: RuntimeSqlLimits = {
  maxBindParameters: 100,
  maxFunctionArguments: 32,
  maxColumnsPerTable: 100,
  maxStatementBytes: 100_000,
  maxLikePatternBytes: 50,
  maxQueryDurationMs: 30_000,
};

/**
 * `readReplicaEligible` means this execution target may be routed to a
 * replica. Cloudflare documents non-session queries as primary-only and
 * requires Sessions for read replication, so a plain binding is not replica
 * eligible.
 */
export const D1_DATABASE_CONSISTENCY: ReadConsistencyCapabilities = {
  transactionReadYourWrites: false,
  postCommitReadYourWrites: false,
  sessionAware: false,
  sequentialSessionConsistency: false,
  readReplicaEligible: false,
};

export const D1_SESSION_CONSISTENCY: ReadConsistencyCapabilities = {
  transactionReadYourWrites: false,
  postCommitReadYourWrites: true,
  sessionAware: true,
  sequentialSessionConsistency: true,
  readReplicaEligible: true,
};

/** D1 is cost-sensitive; typo fallback stays off unless policy explicitly enables it. */
export const D1_DEFAULT_SEARCH_POLICY: SearchPolicy = {
  typoFallback: "disabled-on-cost-sensitive-runtimes",
  costSensitive: true,
};

export function d1RuntimeCapabilities(
  kind: "database" | "session" = "database",
): RuntimeCapabilities {
  return {
    id: kind === "session" ? "d1-session" : "d1",
    dialect: "sqlite",
    limits: D1_SQL_LIMITS,
    consistency: kind === "session" ? D1_SESSION_CONSISTENCY : D1_DATABASE_CONSISTENCY,
    transactions: false,
    batch: true,
    cancellation: false,
    costSensitive: true,
  };
}
