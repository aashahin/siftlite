/**
 * `@siftlite/testing` hosts shared conformance utilities.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

/** Published package identity. */
export const SIFTLITE_TESTING_PACKAGE = {
  name: "@siftlite/testing",
  version: "0.1.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

/** Published package identity type. */
export type SiftLiteTestingPackage = typeof SIFTLITE_TESTING_PACKAGE;

export { runSqlAdapterConformance } from "./adapter-conformance.js";
export { runFts5SearchConformance } from "./fts5-conformance.js";
export { runArabicNormalizationCorpus } from "./arabic-conformance.js";
