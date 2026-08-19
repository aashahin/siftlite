import type { IndexDefinition, SqlAdapter } from "@siftlite/core";
import type { CliResult } from "./cli.js";

export type { CliResult };

/**
 * Loaded host context for mutating CLI commands.
 *
 * Stream D owns config loading. Handlers accept this shape so Integrate can
 * pass `{ adapter, definition }` plus flags from argv.
 */
export interface CommandContext {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly acknowledge?: boolean;
}

export interface ResolvedCommandFlags {
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly acknowledge: boolean;
}

export function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    return undefined;
  }
  return value;
}

export function resolveCommandFlags(
  argv: readonly string[],
  context: CommandContext,
): ResolvedCommandFlags {
  return {
    dryRun: context.dryRun ?? hasFlag(argv, "--dry-run"),
    json: context.json ?? hasFlag(argv, "--json"),
    acknowledge: context.acknowledge ?? hasFlag(argv, "--acknowledge"),
  };
}
