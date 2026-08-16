/**
 * `@siftlite/libsql` — libSQL / Turso Cloud FTS5 runtime adapter.
 *
 * This is not the Turso-native Tantivy backend.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_LIBSQL_PACKAGE = {
  name: "@siftlite/libsql",
  version: "0.0.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteLibsqlPackage = typeof SIFTLITE_LIBSQL_PACKAGE;

export { libsqlAdapter, wrapLibsqlClient } from "./adapter.js";
export type { LibsqlAdapterOptions } from "./adapter.js";
export {
  LIBSQL_LOCAL_CONSISTENCY,
  LIBSQL_LOCAL_LIMITS,
  LIBSQL_REMOTE_CONSISTENCY,
  LIBSQL_REMOTE_LIMITS,
  libsqlRuntimeCapabilities,
} from "./limits.js";
export type {
  LibsqlClientLike,
  LibsqlResultLike,
  LibsqlStatement,
  LibsqlTransactionLike,
  LibsqlValue,
} from "./client.js";
