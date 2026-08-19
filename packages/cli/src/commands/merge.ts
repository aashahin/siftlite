import { isSearchError, SearchError } from "@siftlite/core";
import { ensureRegistry, mergeFtsIndex, readRegistry } from "@siftlite/fts5";
import { failCommand, flagsFor, mutatingGate } from "./shared.js";
import { flagValue, type CliResult, type CommandContext } from "../types.js";

/** SQLite incremental-merge default when `--page-budget` is omitted. */
const DEFAULT_MERGE_PAGE_BUDGET = 8;

export async function runMerge(
  argv: readonly string[],
  context: CommandContext,
): Promise<CliResult> {
  const flags = flagsFor(argv, context);
  const blocked = mutatingGate("merge", flags);
  if (blocked) {
    return blocked;
  }

  const pageBudget = parsePageBudget(argv);
  if (!pageBudget.ok) {
    return pageBudget.result;
  }

  const physical = flags.dryRun
    ? await resolvePhysical(context, false)
    : await resolvePhysical(context, true);
  if (!physical.ok) {
    return {
      status: "error",
      command: "merge",
      message: physical.message,
      data: {
        action: "merge",
        reason: physical.reason,
        indexName: context.definition.name,
        pageBudget: pageBudget.value,
        dryRun: flags.dryRun,
      },
    };
  }

  const data = {
    action: "merge",
    indexName: context.definition.name,
    physicalIndexId: physical.physicalIndexId,
    generation: physical.generation,
    pageBudget: pageBudget.value,
  };

  if (flags.dryRun) {
    return {
      status: "ok",
      command: "merge",
      message: `dry-run merge: mergeFtsIndex on ${context.definition.name} pageBudget=${pageBudget.value}`,
      data: { ...data, dryRun: true },
    };
  }

  try {
    // mergeFtsIndex reads registry itself; physical ids are resolved like the engine.
    const merged = await mergeFtsIndex({
      adapter: context.adapter,
      definition: context.definition,
      pageBudget: pageBudget.value,
    });
    return {
      status: "ok",
      command: "merge",
      message: merged.workRemaining
        ? `merged index ${context.definition.name}; work remaining`
        : `merged index ${context.definition.name}`,
      data: { ...data, ...merged, dryRun: false },
    };
  } catch (error) {
    return failCommand("merge", error);
  }
}

function parsePageBudget(
  argv: readonly string[],
): { ok: true; value: number } | { ok: false; result: CliResult } {
  const raw = flagValue(argv, "--page-budget");
  if (raw === undefined) {
    return { ok: true, value: DEFAULT_MERGE_PAGE_BUDGET };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return {
      ok: false,
      result: {
        status: "error",
        command: "merge",
        message: "merge --page-budget must be a positive safe integer",
        data: { reason: "page-budget" },
      },
    };
  }
  return { ok: true, value };
}

/**
 * Mirrors `resolvePhysical` in `@siftlite/fts5` engine.ts: registry must exist
 * and be healthy. `mergeFtsIndex` only accepts `{ adapter, definition, pageBudget }`.
 */
async function resolvePhysical(
  context: CommandContext,
  ensure: boolean,
): Promise<
  | { ok: true; physicalIndexId: string; generation: number }
  | { ok: false; reason: string; message: string }
> {
  try {
    if (ensure) {
      await ensureRegistry(context.adapter);
    }
    const row = await readRegistry(context.adapter, context.definition.name);
    if (!row) {
      throw new SearchError({
        code: "SEARCH_INDEX_NOT_FOUND",
        message: "index is not registered",
        details: { reason: "missing-registry" },
      });
    }
    if (row.health !== "healthy") {
      throw new SearchError({
        code: "SEARCH_MAINTENANCE_FAILED",
        message: "index is not healthy",
        details: { reason: row.health === "pending" ? "registry-pending" : "registry-unhealthy" },
      });
    }
    return { ok: true, physicalIndexId: row.physicalIndexId, generation: row.activeGeneration };
  } catch (error) {
    if (isSearchError(error)) {
      return {
        ok: false,
        reason: String(error.details?.["reason"] ?? error.code),
        message: error.message,
      };
    }
    return { ok: false, reason: "missing-registry", message: "index is not registered" };
  }
}
