import type {
  ReadConsistencyCapabilities,
  RuntimeCapabilities,
  RuntimeSqlLimits,
} from "@siftlite/core";

/** Conservative local libSQL/SQLite limits. Remote limits stay unproven unless probed. */
export const LIBSQL_LOCAL_LIMITS: RuntimeSqlLimits = {
  maxBindParameters: 32766,
  maxFunctionArguments: 127,
};

export const LIBSQL_REMOTE_LIMITS: RuntimeSqlLimits = {};

export const LIBSQL_LOCAL_CONSISTENCY: ReadConsistencyCapabilities = {
  transactionReadYourWrites: true,
  postCommitReadYourWrites: true,
  sessionAware: false,
  sequentialSessionConsistency: false,
  readReplicaEligible: false,
};

/**
 * Remote libSQL/Turso consistency is unproven until a remote probe records
 * evidence. Replica/session/RYW claims stay false so compilers cannot treat
 * remote as locally consistent.
 */
export const LIBSQL_REMOTE_CONSISTENCY: ReadConsistencyCapabilities = {
  transactionReadYourWrites: false,
  postCommitReadYourWrites: false,
  sessionAware: false,
  sequentialSessionConsistency: false,
  readReplicaEligible: false,
};

export function libsqlRuntimeCapabilities(kind: "local" | "remote" = "local"): RuntimeCapabilities {
  return {
    id: kind === "remote" ? "libsql-remote" : "libsql-local",
    dialect: "sqlite",
    limits: kind === "remote" ? LIBSQL_REMOTE_LIMITS : LIBSQL_LOCAL_LIMITS,
    consistency: kind === "remote" ? LIBSQL_REMOTE_CONSISTENCY : LIBSQL_LOCAL_CONSISTENCY,
    transactions: true,
    batch: true,
    cancellation: false,
    costSensitive: kind === "remote",
  };
}
