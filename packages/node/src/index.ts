/**
 * `@siftlite/node` — better-sqlite3 runtime adapter.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_NODE_PACKAGE = {
  name: "@siftlite/node",
  version: "0.2.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteNodePackage = typeof SIFTLITE_NODE_PACKAGE;

export { nodeSqliteAdapter } from "./adapter.js";
export type {
  BetterSqliteDatabaseLike,
  BetterSqliteStatementLike,
  NodeSqliteAdapterOptions,
} from "./adapter.js";
export {
  NODE_SQLITE_CONSISTENCY,
  NODE_SQLITE_LIMITS,
  nodeSqliteRuntimeCapabilities,
} from "./limits.js";
