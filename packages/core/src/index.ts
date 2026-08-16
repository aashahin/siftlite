/**
 * `@siftlite/core` is the runtime-neutral SiftLite package.
 *
 * It must remain Web/edge-safe: no Node, Bun, D1, libSQL, Drizzle, or Prisma
 * imports. Search contracts are introduced in Phase 1.
 */

/** Published package identity. */
export const SIFTLITE_CORE_PACKAGE = {
  name: "@siftlite/core",
  version: "0.0.0",
} as const;

/** Published package identity type. */
export type SiftLiteCorePackage = typeof SIFTLITE_CORE_PACKAGE;
