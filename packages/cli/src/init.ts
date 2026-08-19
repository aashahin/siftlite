import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const DEFAULT_INIT_CONFIG_NAME = "siftlite.config.mjs";

export const INIT_CONFIG_TEMPLATE = `/**
 * SiftLite CLI config.
 *
 * The CLI never opens SQLite itself. Export \`createAdapter()\` from a host
 * adapter package:
 *
 *   Node: \`nodeSqliteAdapter\` from \`@siftlite/node\` + better-sqlite3
 *   Bun:  \`bunSqliteAdapter\` from \`@siftlite/bun\` + bun:sqlite
 *
 * \`indexes\` may be one \`defineIndex()\` result, an array, or a name-to-
 * definition record. Use \`siftlite check --name <index>\` when several exist.
 */
import { defineIndex } from "@siftlite/core";
// import Database from "better-sqlite3";
// import { nodeSqliteAdapter } from "@siftlite/node";
// import { Database } from "bun:sqlite";
// import { bunSqliteAdapter } from "@siftlite/bun";

export function createAdapter() {
  throw new Error(
    "implement createAdapter() with @siftlite/node (better-sqlite3) or @siftlite/bun (bun:sqlite)",
  );
}

export const indexes = defineIndex({
  name: "documents",
  mode: "manual",
  searchable: { title: { weight: 1 } },
});
`;

export class SiftLiteInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiftLiteInitError";
  }
}

export interface WriteInitConfigOptions {
  readonly cwd: string;
  readonly force?: boolean;
  readonly path?: string;
}

export interface WrittenInitConfig {
  readonly path: string;
}

export function resolveInitConfigPath(cwd: string, path?: string): string {
  if (path === undefined) {
    return resolve(cwd, DEFAULT_INIT_CONFIG_NAME);
  }
  return isAbsolute(path) ? path : resolve(cwd, path);
}

export function writeInitConfig(options: WriteInitConfigOptions): WrittenInitConfig {
  const target = resolveInitConfigPath(options.cwd, options.path);
  if (existsSync(target) && options.force !== true) {
    throw new SiftLiteInitError(`refusing to overwrite ${target} without --force`);
  }
  writeFileSync(target, INIT_CONFIG_TEMPLATE, "utf8");
  return { path: target };
}
