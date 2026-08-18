/**
 * `@siftlite/bun` — bun:sqlite runtime adapter.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_BUN_PACKAGE = {
  name: "@siftlite/bun",
  version: "0.1.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteBunPackage = typeof SIFTLITE_BUN_PACKAGE;

export { bunSqliteAdapter } from "./adapter.js";
export type { BunSqliteAdapterOptions } from "./adapter.js";
export { BUN_SQLITE_CONSISTENCY, BUN_SQLITE_LIMITS, bunRuntimeCapabilities } from "./limits.js";
