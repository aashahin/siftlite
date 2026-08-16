/**
 * Supported Drizzle metadata surface. Tested against drizzle-orm 0.45.2.
 *
 * Public APIs only: `getTableName`, `getTableColumns`, and column fields
 * `name`, `dataType`, `columnType`, `primary`, `notNull`, and timestamp `mode`.
 */
export const SIFTLITE_DRIZZLE_SUPPORT = {
  package: "drizzle-orm",
  testedVersion: "0.45.2",
  peerRange: "^0.45.0",
  metadata: ["getTableName", "getTableColumns", "name", "dataType", "columnType", "mode"],
} as const;

export type SiftLiteDrizzleSupport = typeof SIFTLITE_DRIZZLE_SUPPORT;
