import {
  assertSourceId,
  chunkIdsForHydration,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  type ApplicationLimits,
  type DocumentHydrator,
  type IndexDefinition,
  type SourceId,
  type SqlAdapter,
} from "@siftlite/core";
import { getPrismaModel, type PrismaClientLike } from "./client.js";

export function createPrismaHydrator<TRow extends Record<string, unknown>>(args: {
  readonly prisma: PrismaClientLike;
  readonly model: string;
  readonly definition: IndexDefinition;
  readonly adapter: SqlAdapter;
  readonly limits?: ApplicationLimits;
}): DocumentHydrator<TRow> {
  const limits = args.limits ?? DEFAULT_APPLICATION_LIMITS;
  const idField = args.definition.source?.primaryKey.field ?? "id";
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
          const id = assertSourceId(
            typeof row[idField] === "number" ? row[idField] : String(row[idField]),
          );
          documents.set(id, row as TRow);
        }
      }
      return documents;
    },
  };
}
