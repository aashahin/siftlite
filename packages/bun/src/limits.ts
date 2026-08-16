import type {
  ReadConsistencyCapabilities,
  RuntimeCapabilities,
  RuntimeSqlLimits,
} from "@siftlite/core";

/** Conservative Bun/SQLite defaults. Unlisted limits remain unproven. */
export const BUN_SQLITE_LIMITS: RuntimeSqlLimits = {
  maxBindParameters: 32766,
  maxFunctionArguments: 127,
};

export const BUN_SQLITE_CONSISTENCY: ReadConsistencyCapabilities = {
  transactionReadYourWrites: true,
  postCommitReadYourWrites: true,
  sessionAware: false,
  sequentialSessionConsistency: false,
  readReplicaEligible: false,
};

export function bunRuntimeCapabilities(): RuntimeCapabilities {
  return {
    id: "bun-sqlite",
    dialect: "sqlite",
    limits: BUN_SQLITE_LIMITS,
    consistency: BUN_SQLITE_CONSISTENCY,
    transactions: true,
    batch: true,
    cancellation: false,
    costSensitive: false,
  };
}
