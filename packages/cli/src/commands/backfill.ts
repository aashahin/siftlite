import { commandHandle, failCommand, flagsFor, mutatingGate, readRegistryRow } from "./shared.js";
import type { CliResult, CommandContext } from "../types.js";

/**
 * Backfill is not a separate public FTS5 API. Pending or missing indexes are
 * created/healed via `handle.create()` (linked create includes source backfill).
 * A healthy index is refused — never reported as success. Use rebuild to rematerialize.
 */
export async function runBackfill(
  argv: readonly string[],
  context: CommandContext,
): Promise<CliResult> {
  const flags = flagsFor(argv, context);
  const blocked = mutatingGate("backfill", flags);
  if (blocked) {
    return blocked;
  }

  const existing = await readRegistryRow(context.adapter, context.definition.name);
  const health = existing?.health ?? "missing";
  const plan = backfillPlan(context, health);

  if (health === "healthy") {
    return {
      status: "error",
      command: "backfill",
      message: plan.message,
      data: { ...plan.data, dryRun: flags.dryRun },
    };
  }

  if (flags.dryRun) {
    return {
      status: "ok",
      command: "backfill",
      message: plan.message,
      data: { ...plan.data, dryRun: true },
    };
  }

  try {
    await commandHandle(context).create();
    return {
      status: "ok",
      command: "backfill",
      message: plan.doneMessage,
      data: { ...plan.data, dryRun: false },
    };
  } catch (error) {
    return failCommand("backfill", error);
  }
}

function backfillPlan(
  context: CommandContext,
  health: "missing" | "pending" | "healthy" | string,
): { message: string; doneMessage: string; data: Record<string, unknown> } {
  const indexName = context.definition.name;
  const sourceTable = context.definition.source?.table ?? null;
  if (health === "healthy") {
    return {
      message:
        "index already exists; backfill only creates or heals pending/missing indexes — use rebuild to rematerialize",
      doneMessage: "index already exists",
      data: {
        action: "refuse",
        reason: "already-exists",
        health,
        indexName,
        sourceTable,
      },
    };
  }
  const action = health === "pending" ? "heal" : "create";
  return {
    message:
      action === "heal"
        ? `dry-run backfill: heal pending index ${indexName} via create()`
        : `dry-run backfill: create index ${indexName} and backfill source rows`,
    doneMessage:
      action === "heal"
        ? `healed pending index ${indexName}`
        : `created index ${indexName} and backfilled source rows`,
    data: {
      action,
      health,
      indexName,
      sourceTable,
    },
  };
}
