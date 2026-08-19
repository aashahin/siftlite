import { commandHandle, failCommand, flagsFor, mutatingGate, readRegistryRow } from "./shared.js";
import type { CliResult, CommandContext } from "../types.js";

export async function runRebuild(
  argv: readonly string[],
  context: CommandContext,
): Promise<CliResult> {
  const flags = flagsFor(argv, context);
  const blocked = mutatingGate("rebuild", flags);
  if (blocked) {
    return blocked;
  }

  const existing = await readRegistryRow(context.adapter, context.definition.name);
  const data = {
    action: "rebuild",
    indexName: context.definition.name,
    sourceTable: context.definition.source?.table ?? null,
    health: existing?.health ?? "missing",
    physicalIndexId: existing?.physicalIndexId ?? null,
    generation: existing?.activeGeneration ?? null,
  };

  if (flags.dryRun) {
    return {
      status: "ok",
      command: "rebuild",
      message: `dry-run rebuild: call rebuild() on index ${context.definition.name} (source table preserved)`,
      data: { ...data, dryRun: true },
    };
  }

  try {
    await commandHandle(context).rebuild();
    const after = await readRegistryRow(context.adapter, context.definition.name);
    return {
      status: "ok",
      command: "rebuild",
      message: `rebuilt index ${context.definition.name}`,
      data: {
        ...data,
        dryRun: false,
        health: after?.health ?? null,
        physicalIndexId: after?.physicalIndexId ?? data.physicalIndexId,
        generation: after?.activeGeneration ?? data.generation,
      },
    };
  } catch (error) {
    return failCommand("rebuild", error);
  }
}
