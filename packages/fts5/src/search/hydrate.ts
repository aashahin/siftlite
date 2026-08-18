import {
  assertSourceId,
  chunkIdsForHydration,
  codecForFieldType,
  SearchError,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  quoteIdent,
  sql,
  type ApplicationLimits,
  type DocumentHydrator,
  type EncodedFieldValue,
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
  if (value === undefined || value === null) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "source id is missing from the hydrated row",
      details: { reason: "missing-source-id" },
    });
  }
  if (typeof value === "bigint") {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "source id rejects bigint; portable v1 source IDs are string or safe integer",
      details: { reason: "bigint" },
    });
  }
  if (definition.source?.primaryKey.type === "safe-integer") {
    if (typeof value === "number") {
      return assertSourceId(value);
    }
    if (typeof value === "string" && value.trim() !== "" && isExactSafeIntegerDecimal(value)) {
      return assertSourceId(Number(value));
    }
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "source id is not an exact safe-integer decimal",
      details: { reason: "invalid-source-id" },
    });
  }
  return assertSourceId(String(value));
}

const EXACT_SAFE_INTEGER_DECIMAL = /^-?(0|[1-9]\d*)$/;

function isExactSafeIntegerDecimal(value: string): boolean {
  if (!EXACT_SAFE_INTEGER_DECIMAL.test(value)) {
    return false;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return false;
  }
  return String(parsed) === value;
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
    document[field] = decodeProjectedField(definition, field, row[field]);
  }
  return document;
}

function decodeProjectedField(definition: IndexDefinition, field: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  const spec = definition.filterable[field] ?? definition.sortable[field];
  if (!spec) {
    return value;
  }
  return codecForFieldType(spec).decode(value as EncodedFieldValue);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
