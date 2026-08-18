import type {
  ReadConsistencyCapabilities,
  RuntimeCapabilities,
  RuntimeSqlLimits,
} from "@siftlite/core";

export const NODE_SQLITE_LIMITS: RuntimeSqlLimits = {
  maxBindParameters: 32766,
  maxFunctionArguments: 127,
};

export const NODE_SQLITE_CONSISTENCY: ReadConsistencyCapabilities = {
  transactionReadYourWrites: true,
  postCommitReadYourWrites: true,
  sessionAware: false,
  sequentialSessionConsistency: false,
  readReplicaEligible: false,
};

export function nodeSqliteRuntimeCapabilities(): RuntimeCapabilities {
  return {
    id: "node-better-sqlite3",
    dialect: "sqlite",
    limits: NODE_SQLITE_LIMITS,
    consistency: NODE_SQLITE_CONSISTENCY,
    transactions: true,
    batch: true,
    cancellation: false,
    costSensitive: false,
  };
}
