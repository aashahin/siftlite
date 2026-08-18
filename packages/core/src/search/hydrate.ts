import { SearchError } from "../errors/search-error.js";
import type { SourceId } from "../ids/source-id.js";
import { sourceIdsEqual } from "../ids/source-id.js";
import type { StatementBudget } from "../limits/budget.js";
import { effectiveMaxInValues } from "../limits/budget.js";

/**
 * Split identifiers into bind-safe chunks. Uses the remaining proven bind
 * budget intersected with the application IN ceiling. Unproven limits fall
 * back to the application ceiling rather than becoming unlimited.
 */
export function chunkIdsForHydration<T>(
  ids: readonly T[],
  budget: StatementBudget,
): readonly (readonly T[])[] {
  if (ids.length === 0) {
    return [];
  }
  const size = effectiveMaxInValues(budget);
  if (size === 0) {
    throw new SearchError({
      code: "SEARCH_RUNTIME_LIMIT_EXCEEDED",
      message: "hydration cannot proceed with a zero IN-list budget",
      details: {
        reason: "hydration-budget",
        allowed: 0,
      },
    });
  }
  const chunks: T[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

/**
 * Restore search rank after batched hydration. Missing documents become
 * undefined slots; hits are not dropped.
 */
export function attachHydratedDocuments<TDocument>(
  ids: readonly SourceId[],
  documents: ReadonlyMap<SourceId, TDocument>,
): readonly (TDocument | undefined)[] {
  return ids.map((id) => findHydrated(documents, id));
}

function findHydrated<TDocument>(
  documents: ReadonlyMap<SourceId, TDocument>,
  id: SourceId,
): TDocument | undefined {
  const direct = documents.get(id);
  if (direct !== undefined) {
    return direct;
  }
  for (const [key, value] of documents) {
    if (sourceIdsEqual(key, id)) {
      return value;
    }
  }
  return undefined;
}
