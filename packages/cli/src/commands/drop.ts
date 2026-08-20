import { physicalIndexIdFor } from "@siftlite/core";
import { physicalNames } from "@siftlite/fts5";
import {
  commandHandle,
  failCommand,
  flagsFor,
  mutatingGate,
  readRegistryRow,
  sourceTableOf,
} from "./shared.js";
import type { CliResult, CommandContext } from "../types.js";

export async function runDrop(
  argv: readonly string[],
  context: CommandContext,
): Promise<CliResult> {
  const flags = flagsFor(argv, context);
  const blocked = mutatingGate("drop", flags);
  if (blocked) {
    return blocked;
  }

  const existing = await readRegistryRow(context.adapter, context.definition.name);
  const physicalIndexId = existing?.physicalIndexId ?? physicalIndexIdFor(context.definition.name);
  const generation = existing?.activeGeneration ?? 1;
  const sourceTable = sourceTableOf(context.definition);
  const searchObjects = dropTargetNames(context, physicalIndexId, generation);
  const data = {
    action: "drop",
    indexName: context.definition.name,
    sourceTable,
    sourceTablePreserved: true,
    physicalIndexId,
    generation,
    searchObjects,
  };

  if (flags.dryRun) {
    return {
      status: "ok",
      command: "drop",
      message: `dry-run drop: remove search objects for ${context.definition.name}; source table ${sourceTable ?? "(none)"} is not dropped`,
      data: { ...data, dryRun: true },
    };
  }

  try {
    await commandHandle(context).drop();
    return {
      status: "ok",
      command: "drop",
      message: `dropped search objects for ${context.definition.name}; source table preserved`,
      data: { ...data, dryRun: false },
    };
  } catch (error) {
    return failCommand("drop", error);
  }
}

function dropTargetNames(
  context: CommandContext,
  physicalIndexId: string,
  generation: number,
): readonly string[] {
  const generations =
    generation > 1 ? [generation, generation + 1, generation - 1] : [generation, generation + 1];
  const names: string[] = [];
  for (const next of generations) {
    const physical = physicalNames(context.definition, physicalIndexId, next);
    names.push(physical.docs, physical.fts, physical.ftsTrigram);
  }
  return names;
}
