/**
 * `@siftlite/fts5` is the SQLite FTS5 search backend.
 *
 * Phase 0 exports package identity only. Compiler and capability probes land
 * in later phases.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

/** Published package identity. */
export const SIFTLITE_FTS5_PACKAGE = {
  name: "@siftlite/fts5",
  version: "0.0.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

/** Published package identity type. */
export type SiftLiteFts5Package = typeof SIFTLITE_FTS5_PACKAGE;
