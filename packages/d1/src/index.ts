/**
 * `@siftlite/d1` — Cloudflare D1 runtime adapter.
 *
 * Fuzzy/typo fallback remains disabled by default on this cost-sensitive runtime.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_D1_PACKAGE = {
  name: "@siftlite/d1",
  version: "0.0.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteD1Package = typeof SIFTLITE_D1_PACKAGE;

export { d1Adapter, d1SessionAdapter } from "./adapter.js";
export type { D1SqlAdapter } from "./adapter.js";
export { assertD1BindValue, assertD1BindValues } from "./bind.js";
export {
  D1_DATABASE_CONSISTENCY,
  D1_DEFAULT_SEARCH_POLICY,
  D1_SESSION_CONSISTENCY,
  D1_SQL_LIMITS,
  d1RuntimeCapabilities,
} from "./limits.js";
export type {
  D1DatabaseLike,
  D1ExecutionTarget,
  D1PreparedLike,
  D1ResultLike,
  D1ResultMetaLike,
  D1SessionConstraint,
  D1SessionLike,
} from "./client.js";
export type { D1QueryMeta } from "./meta.js";
