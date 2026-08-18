/**
 * `@siftlite/drizzle` — optional Drizzle companion.
 *
 * Maps Drizzle table metadata into canonical SiftLite schema. It does not own
 * synchronization; database triggers remain the source of truth.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_DRIZZLE_PACKAGE = {
  name: "@siftlite/drizzle",
  version: "0.1.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteDrizzlePackage = typeof SIFTLITE_DRIZZLE_PACKAGE;

export { SIFTLITE_DRIZZLE_SUPPORT } from "./versions.js";
export type { SiftLiteDrizzleSupport } from "./versions.js";
export type { DrizzleColumnLike, PortableDrizzleIdColumn } from "./columns.js";
export { mapDrizzleColumnToFieldType, mapDrizzleIdColumn } from "./columns.js";
export { defineDrizzleIndex } from "./define-index.js";
export type { DrizzleIndex, DrizzleIndexInput } from "./define-index.js";
export { generateDrizzleSearchSql } from "./migrate.js";
export type { DrizzleSearchMigration } from "./migrate.js";
export { createDrizzleHydrator } from "./hydrate.js";
export type { DrizzleSelectDatabase } from "./hydrate.js";
export { drizzleSearch } from "./search.js";
export type { DrizzleSearchHandle } from "./search.js";
