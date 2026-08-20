import { isSearchError, type IndexDefinition, type SqlAdapter } from "@siftlite/core";
import { createFts5Engine, readRegistry } from "@siftlite/fts5";
import type { CliResult, CommandContext, ResolvedCommandFlags } from "../types.js";
import { resolveCommandFlags } from "../types.js";

export function commandHandle(context: CommandContext) {
  return createFts5Engine({ adapter: context.adapter }).index(context.definition);
}

export function refuseWithoutAcknowledge(command: string): CliResult {
  return {
    status: "error",
    command,
    message: `${command} is destructive or mutating; pass --acknowledge`,
  };
}

export function failCommand(command: string, error: unknown): CliResult {
  if (isSearchError(error)) {
    return {
      status: "error",
      command,
      message: error.message,
      data: { code: error.code, details: error.details ?? null },
    };
  }
  return {
    status: "error",
    command,
    message: error instanceof Error ? error.message : String(error),
  };
}

export function mutatingGate(command: string, flags: ResolvedCommandFlags): CliResult | null {
  if (flags.dryRun) {
    return null;
  }
  if (!flags.acknowledge) {
    return refuseWithoutAcknowledge(command);
  }
  return null;
}

export function flagsFor(argv: readonly string[], context: CommandContext): ResolvedCommandFlags {
  return resolveCommandFlags(argv, context);
}

export async function readRegistryRow(adapter: SqlAdapter, indexName: string) {
  try {
    return await readRegistry(adapter, indexName);
  } catch {
    return null;
  }
}

export function sourceTableOf(definition: IndexDefinition): string | null {
  return definition.source?.table ?? null;
}
