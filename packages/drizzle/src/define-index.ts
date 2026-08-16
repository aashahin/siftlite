import {
  defineIndex,
  SearchError,
  type IndexDefinition,
  type IndexDefinitionInput,
  type SearchableFieldConfig,
} from "@siftlite/core";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  assertSearchableDrizzleColumn,
  mapDrizzleColumnToFieldType,
  mapDrizzleIdColumn,
  type DrizzleColumnLike,
  type PortableDrizzleIdColumn,
} from "./columns.js";

export interface DrizzleIndexInput<TTable> {
  readonly id: PortableDrizzleIdColumn;
  readonly name?: string;
  readonly mode?: "linked" | "manual";
  readonly normalization?: IndexDefinitionInput["normalization"];
  readonly searchable: Readonly<Record<string, SearchableFieldConfig>>;
  readonly filterable?: Readonly<Record<string, DrizzleColumnLike>>;
  readonly sortable?: Readonly<Record<string, DrizzleColumnLike>>;
  readonly facets?: readonly DrizzleColumnLike[];
  readonly prefix?: IndexDefinitionInput["prefix"];
  readonly typoTolerance?: IndexDefinitionInput["typoTolerance"];
  readonly synonyms?: IndexDefinitionInput["synonyms"];
  readonly matchingStrategy?: IndexDefinitionInput["matchingStrategy"];
  readonly table?: TTable;
}

export interface DrizzleIndex<TTable = unknown> {
  readonly definition: IndexDefinition;
  readonly table: TTable;
  readonly idColumn: PortableDrizzleIdColumn;
}

export function defineDrizzleIndex<TTable extends object>(
  table: TTable,
  input: DrizzleIndexInput<TTable>,
): DrizzleIndex<TTable> {
  const tableName = getTableName(table as never);
  const columns = getTableColumns(table as never) as Record<string, DrizzleColumnLike>;
  const id = mapDrizzleIdColumn(input.id);

  const searchable: Record<string, SearchableFieldConfig> = {};
  for (const [key, config] of Object.entries(input.searchable)) {
    const column = resolveTableColumn(columns, key);
    assertSearchableDrizzleColumn(column);
    searchable[column.name] = config;
  }

  const filterable: Record<string, ReturnType<typeof mapDrizzleColumnToFieldType>> = {};
  for (const [key, column] of Object.entries(input.filterable ?? {})) {
    assertColumnBelongsToTable(columns, column, key);
    filterable[column.name] = mapDrizzleColumnToFieldType(column);
  }

  const sortable: Record<string, ReturnType<typeof mapDrizzleColumnToFieldType>> = {};
  for (const [key, column] of Object.entries(input.sortable ?? {})) {
    assertColumnBelongsToTable(columns, column, key);
    sortable[column.name] = mapDrizzleColumnToFieldType(column);
  }

  const facets = (input.facets ?? []).map((column) => {
    assertColumnBelongsToTable(columns, column, column.name);
    return column.name;
  });

  const definition = defineIndex({
    name: input.name ?? tableName,
    mode: input.mode ?? "linked",
    source: {
      table: tableName,
      primaryKey: id,
    },
    searchable,
    ...(input.normalization ? { normalization: input.normalization } : {}),
    ...(Object.keys(filterable).length > 0 ? { filterable } : {}),
    ...(Object.keys(sortable).length > 0 ? { sortable } : {}),
    ...(facets.length > 0 ? { facets } : {}),
    ...(input.prefix ? { prefix: input.prefix } : {}),
    ...(input.typoTolerance ? { typoTolerance: input.typoTolerance } : {}),
    ...(input.synonyms ? { synonyms: input.synonyms } : {}),
    ...(input.matchingStrategy ? { matchingStrategy: input.matchingStrategy } : {}),
  });

  return {
    definition,
    table,
    idColumn: input.id,
  };
}

function resolveTableColumn(
  columns: Record<string, DrizzleColumnLike>,
  key: string,
): DrizzleColumnLike {
  const byJsKey = columns[key];
  if (byJsKey) {
    return byJsKey;
  }
  const bySqlName = Object.values(columns).find((column) => column.name === key);
  if (bySqlName) {
    return bySqlName;
  }
  throw new SearchError({
    code: "SEARCH_CONFIG_INVALID",
    message: `Drizzle table has no column ${key}`,
    details: { reason: "missing-drizzle-column", column: key },
  });
}

function assertColumnBelongsToTable(
  columns: Record<string, DrizzleColumnLike>,
  column: DrizzleColumnLike,
  label: string,
): void {
  const match = Object.values(columns).some(
    (candidate) => candidate.name === column.name && candidate.columnType === column.columnType,
  );
  if (!match) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `column ${label} is not part of the Drizzle table`,
      details: { reason: "foreign-drizzle-column", column: label },
    });
  }
}
