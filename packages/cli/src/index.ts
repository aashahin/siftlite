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

export { runCli, flagValue } from "./cli.js";
export type { CliResult, CliRunOptions } from "./cli.js";
export type { CommandContext } from "./types.js";
export { runBackfill } from "./commands/backfill.js";
export { runRebuild } from "./commands/rebuild.js";
export { runMerge } from "./commands/merge.js";
export { runDrop } from "./commands/drop.js";
export {
  DEFAULT_CONFIG_FILES,
  importSiftLiteConfig,
  loadSiftLiteConfig,
  resolveConfigPath,
  resolveIndexDefinition,
  SiftLiteConfigError,
} from "./config.js";
export type {
  LoadedSiftLiteConfig,
  LoadSiftLiteConfigOptions,
  SiftLiteConfigModule,
} from "./config.js";
export {
  DEFAULT_INIT_CONFIG_NAME,
  INIT_CONFIG_TEMPLATE,
  resolveInitConfigPath,
  SiftLiteInitError,
  writeInitConfig,
} from "./init.js";
export type { WriteInitConfigOptions, WrittenInitConfig } from "./init.js";
