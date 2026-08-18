import {
  chunkIdsForHydration,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  SearchError,
  type ApplicationLimits,
  type DocumentHydrator,
  type IndexDefinition,
  type SourceId,
  type SqlAdapter,
} from "@siftlite/core";
import { restoreSourceId } from "@siftlite/fts5";
import { getPrismaModel, type PrismaClientLike } from "./client.js";

export function createPrismaHydrator<TRow extends Record<string, unknown>>(args: {
  readonly prisma: PrismaClientLike;
  readonly model: string;
  readonly definition: IndexDefinition;
  readonly adapter: SqlAdapter;
  readonly limits?: ApplicationLimits;
  /** Prisma model field for findMany/row reads. SQL still uses source.primaryKey.field. */
  readonly prismaIdField?: string;
}): DocumentHydrator<TRow> {
  const source = args.definition.source;
  if (!source) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "Prisma hydration requires a source primary key",
      details: { reason: "missing-source" },
    });
  }
  const limits = args.limits ?? DEFAULT_APPLICATION_LIMITS;
  const idField = args.prismaIdField ?? source.primaryKey.field;
  const delegate = getPrismaModel(args.prisma, args.model);

  return {
    async hydrate(ids) {
      const documents = new Map<SourceId, TRow>();
      if (ids.length === 0) {
        return documents;
      }
      const budget = createStatementBudget(args.adapter.runtimeCapabilities.limits, limits);
      for (const chunk of chunkIdsForHydration(ids, budget)) {
        const rows = await Promise.resolve(
          delegate.findMany({
            where: { [idField]: { in: [...chunk] } },
          }),
        );
        for (const row of rows) {
          documents.set(restoreSourceId(args.definition, row[idField]), row as TRow);
        }
      }
      return documents;
    },
  };
}
