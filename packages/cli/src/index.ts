/**
 * `@siftlite/cli` — portable SiftLite command-line interface.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_CLI_PACKAGE = {
  name: "@siftlite/cli",
  version: "0.1.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteCliPackage = typeof SIFTLITE_CLI_PACKAGE;

export { runCli } from "./cli.js";
export type { CliResult } from "./cli.js";
