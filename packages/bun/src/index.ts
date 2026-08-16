/**
 * `@siftlite/bun` is the bun:sqlite runtime adapter.
 *
 * Runtime-specific imports belong only in this package. Phase 0 exports
 * package identity only; the SQL adapter lands in a later phase.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

/** Published package identity. */
export const SIFTLITE_BUN_PACKAGE = {
  name: "@siftlite/bun",
  version: "0.0.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

/** Published package identity type. */
export type SiftLiteBunPackage = typeof SIFTLITE_BUN_PACKAGE;
