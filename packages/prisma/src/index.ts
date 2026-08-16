/**
 * `@siftlite/prisma` — optional Prisma companion.
 *
 * Canonical search stays `createPrismaSearch`. Client Extensions are
 * ergonomic wrappers only. Database triggers own linked synchronization.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_PRISMA_PACKAGE = {
  name: "@siftlite/prisma",
  version: "0.0.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLitePrismaPackage = typeof SIFTLITE_PRISMA_PACKAGE;

export { SIFTLITE_PRISMA_SUPPORT } from "./versions.js";
export type { SiftLitePrismaSupport } from "./versions.js";
export type { PrismaClientLike, PrismaFindManyArgs, PrismaModelDelegateLike } from "./client.js";
export { getPrismaModel } from "./client.js";
export { createPrismaHydrator } from "./hydrate.js";
export { generatePrismaSearchSql } from "./migrate.js";
export type { PrismaSearchMigration } from "./migrate.js";
export { createPrismaSearch } from "./search.js";
export type { PrismaSearchService } from "./search.js";
export { searchExtension } from "./extension.js";
export type { SearchExtensionOptions } from "./extension.js";
