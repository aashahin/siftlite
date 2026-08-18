import {
  SearchError,
  type IndexDefinition,
  type SearchRequest,
  type SearchResponse,
  type SqlAdapter,
} from "@siftlite/core";
import { readRegistry, searchFts5Index } from "@siftlite/fts5";
import type { PrismaClientLike } from "./client.js";
import { createPrismaHydrator } from "./hydrate.js";

export interface PrismaSearchService<TRow extends Record<string, unknown>> {
  readonly definition: IndexDefinition;
  readonly model: string;
  search(query: string, request?: SearchRequest): Promise<SearchResponse<TRow>>;
}

export function createPrismaSearch<TRow extends Record<string, unknown>>(options: {
  readonly prisma: PrismaClientLike;
  readonly adapter: SqlAdapter;
  readonly model: string;
  readonly index: IndexDefinition;
}): PrismaSearchService<TRow> {
  if (options.model.length === 0) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "Prisma search requires a model name",
      details: { reason: "missing-prisma-model" },
    });
  }
  return {
    definition: options.index,
    model: options.model,
    async search(query, request = {}) {
      const row = await readRegistry(options.adapter, options.index.name);
      if (!row) {
        throw new SearchError({
          code: "SEARCH_INDEX_NOT_FOUND",
          message: "Prisma search index is not registered",
          details: { reason: "missing-registry", model: options.model },
        });
      }
      if (row.health !== "healthy") {
        throw new SearchError({
          code: "SEARCH_MAINTENANCE_FAILED",
          message: "Prisma search index is not healthy",
          details: { reason: "registry-pending", model: options.model },
        });
      }
      return searchFts5Index(
        {
          adapter: options.adapter,
          definition: options.index,
          physicalIndexId: row.physicalIndexId,
          generation: row.activeGeneration,
          hydrator: createPrismaHydrator({
            prisma: options.prisma,
            model: options.model,
            definition: options.index,
            adapter: options.adapter,
          }),
        },
        query,
        request,
      ) as Promise<SearchResponse<TRow>>;
    },
  };
}
