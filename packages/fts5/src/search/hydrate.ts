import {
  assertSourceId,
  chunkIdsForHydration,
  SearchError,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  quoteIdent,
  sourceIdKind,
  sql,
  type ApplicationLimits,
  type DocumentHydrator,
  type IndexDefinition,
  type RuntimeSqlLimits,
  type SourceId,
  type SqlAdapter,
} from "@siftlite/core";
import { physicalNames } from "../names.js";

export function createProjectionHydrator(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly physicalIndexId: string;
  readonly generation: number;
  readonly limits?: ApplicationLimits;
  readonly runtimeLimits?: RuntimeSqlLimits;
}): DocumentHydrator<Record<string, unknown>> {
  const limits = args.limits ?? DEFAULT_APPLICATION_LIMITS;
  const runtimeLimits = args.runtimeLimits ?? args.adapter.runtimeCapabilities.limits;
  const names = physicalNames(args.definition, args.physicalIndexId, args.generation);
  const projected = unique([...args.definition.filterableOrder, ...args.definition.sortableOrder]);
  const columns = [
    quoteIdent("source_id"),
    ...args.definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)),
    ...projected.map((field) => quoteIdent(field)),
  ];

  return {
    async hydrate(ids) {
      const documents = new Map<SourceId, Record<string, unknown>>();
      if (ids.length === 0) {
        return documents;
      }
      const budget = createStatementBudget(runtimeLimits, limits);
      for (const chunk of chunkIdsForHydration(ids, budget)) {
        const placeholders = chunk.map(() => "?").join(", ");
        const rows = await args.adapter.query<ProjectionRow>(
          sql(
            `SELECT ${columns.join(", ")} FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} IN (${placeholders})`,
            [...chunk],
          ),
        );
        for (const row of rows) {
          const id = restoreSourceId(args.definition, row.source_id);
          documents.set(id, toDocument(args.definition, projected, row, id));
        }
      }
      return documents;
    },
  };
}

export function createSourceTableHydrator(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly limits?: ApplicationLimits;
  readonly runtimeLimits?: RuntimeSqlLimits;
}): DocumentHydrator<Record<string, unknown>> {
  const source = args.definition.source;
  if (!source) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "source-table hydration requires a source table",
      details: { reason: "missing-source" },
    });
  }
  const limits = args.limits ?? DEFAULT_APPLICATION_LIMITS;
  const runtimeLimits = args.runtimeLimits ?? args.adapter.runtimeCapabilities.limits;
  const pk = quoteIdent(source.primaryKey.field);

  return {
    async hydrate(ids) {
      const documents = new Map<SourceId, Record<string, unknown>>();
      if (ids.length === 0) {
        return documents;
      }
      const budget = createStatementBudget(runtimeLimits, limits);
      for (const chunk of chunkIdsForHydration(ids, budget)) {
        const placeholders = chunk.map(() => "?").join(", ");
        const rows = await args.adapter.query<Record<string, unknown>>(
          sql(`SELECT * FROM ${quoteIdent(source.table)} WHERE ${pk} IN (${placeholders})`, [
            ...chunk,
          ]),
        );
        for (const row of rows) {
          const raw = row[source.primaryKey.field];
          const id = restoreSourceId(args.definition, raw);
          documents.set(id, { ...row, [source.primaryKey.field]: id });
        }
      }
      return documents;
    },
  };
}

export function restoreSourceId(definition: IndexDefinition, value: unknown): SourceId {
  if (definition.source?.primaryKey.type === "safe-integer") {
    return assertSourceId(typeof value === "number" ? value : Number(value));
  }
  if (typeof value === "number" && sourceIdKind(value) === "safe-integer") {
    return value;
  }
  return assertSourceId(String(value));
}

interface ProjectionRow {
  readonly source_id: unknown;
  readonly [column: string]: unknown;
}

function toDocument(
  definition: IndexDefinition,
  projected: readonly string[],
  row: ProjectionRow,
  id: SourceId,
): Record<string, unknown> {
  const document: Record<string, unknown> = {
    [definition.source?.primaryKey.field ?? "id"]: id,
  };
  for (const field of definition.searchableOrder) {
    document[field] = row[`${field}_source`] ?? null;
  }
  for (const field of projected) {
    document[field] = row[field] ?? null;
  }
  return document;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
