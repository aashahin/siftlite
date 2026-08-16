/**
 * `@siftlite/testing` hosts shared conformance utilities.
 *
 * Phase 0 exports package identity only. Adapter/backend factories land in
 * later phases.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

/** Published package identity. */
export const SIFTLITE_TESTING_PACKAGE = {
  name: "@siftlite/testing",
  version: "0.0.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

/** Published package identity type. */
export type SiftLiteTestingPackage = typeof SIFTLITE_TESTING_PACKAGE;
