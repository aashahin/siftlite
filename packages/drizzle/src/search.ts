import {
  SearchError,
  type SearchRequest,
  type SearchResponse,
  type SqlAdapter,
} from "@siftlite/core";
import { readRegistry, searchFts5Index } from "@siftlite/fts5";
import type { DrizzleIndex } from "./define-index.js";
import { createDrizzleHydrator, type DrizzleSelectDatabase } from "./hydrate.js";

export interface DrizzleSearchHandle<TRow extends Record<string, unknown>> {
  search(query: string, request?: SearchRequest): Promise<SearchResponse<TRow>>;
}

export function drizzleSearch<TTable, TRow extends Record<string, unknown>>(
  db: DrizzleSelectDatabase<TTable, TRow>,
  index: DrizzleIndex<TTable>,
  adapter: SqlAdapter,
): DrizzleSearchHandle<TRow> {
  return {
    async search(query, request = {}) {
      const row = await readRegistry(adapter, index.definition.name);
      if (!row || row.health !== "healthy") {
        throw new SearchError({
          code: "SEARCH_INDEX_NOT_FOUND",
          message: "Drizzle search index is not registered",
          details: { reason: "missing-registry", index: index.definition.name },
        });
      }
      const hydrator = createDrizzleHydrator({ db, index, adapter });
      return searchFts5Index(
        {
          adapter,
          definition: index.definition,
          physicalIndexId: row.physicalIndexId,
          generation: row.activeGeneration,
          hydrator,
        },
        query,
        request,
      ) as Promise<SearchResponse<TRow>>;
    },
  };
}
