import {
  assertSqlIdentifier,
  physicalIndexIdFor,
  quoteIdent,
  type IndexDefinition,
} from "@siftlite/core";
import { physicalNames, sourceIdColumnType } from "../names.js";
import { compileSearchableExpression } from "../normalize-sql.js";

export function compileDocsDdl(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): string {
  const names = physicalNames(definition, physicalIndexId, generation);
  const projected = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const columns = [
    `${quoteIdent("doc_id")} INTEGER PRIMARY KEY`,
    `${quoteIdent("source_id")} ${sourceIdColumnType(definition)} NOT NULL UNIQUE`,
    ...definition.searchableOrder.map((field) => `${quoteIdent(`${field}_source`)} TEXT`),
    ...projected.map((field) => {
      const spec = definition.filterable[field] ?? definition.sortable[field];
      return `${quoteIdent(field)} ${storageSql(spec?.storageKind ?? "text")}`;
    }),
  ];
  return `CREATE TABLE ${quoteIdent(names.docs)} (${columns.join(", ")})`;
}

export function compileFtsDdl(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
  options?: { readonly secureDelete?: boolean },
): string {
  const names = physicalNames(definition, physicalIndexId, generation);
  const columns = definition.searchableOrder.map((field) => quoteIdent(field)).join(", ");
  const prefix = definition.prefix.length > 0 ? `, prefix='${definition.prefix.join(" ")}'` : "";
  const secureDelete = options?.secureDelete === true ? ", secure-delete=1" : "";
  return `CREATE VIRTUAL TABLE ${quoteIdent(names.fts)} USING fts5(${columns}${prefix}, tokenize='unicode61'${secureDelete})`;
}

export function projectionIndexName(docsTable: string, field: string): string {
  const candidate = `${docsTable}_${field}`;
  if (candidate.length <= 96) {
    return assertSqlIdentifier(candidate);
  }
  return assertSqlIdentifier(`__sift_px_${physicalIndexIdFor(candidate)}`);
}

export function compileProjectionIndexes(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): string[] {
  const names = physicalNames(definition, physicalIndexId, generation);
  const fields = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  return fields.map((field) => {
    const indexName = projectionIndexName(names.docs, field);
    return `CREATE INDEX ${quoteIdent(indexName)} ON ${quoteIdent(names.docs)} (${quoteIdent(field)})`;
  });
}

export function compileBackfillSql(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): readonly string[] {
  if (!definition.source) {
    return [];
  }
  const names = physicalNames(definition, physicalIndexId, generation);
  const source = quoteIdent(definition.source.table);
  const pk = quoteIdent(definition.source.primaryKey.field);
  const docs = quoteIdent(names.docs);
  const fts = quoteIdent(names.fts);
  const projected = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const docCols = [
    quoteIdent("source_id"),
    ...definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)),
    ...projected.map((field) => quoteIdent(field)),
  ];
  const docSelect = [
    pk,
    ...definition.searchableOrder.map((field) => quoteIdent(field)),
    ...projected.map((field) => quoteIdent(field)),
  ];
  const ftsCols = [
    quoteIdent("rowid"),
    ...definition.searchableOrder.map((field) => quoteIdent(field)),
  ];
  const ftsSelect = [
    quoteIdent("doc_id"),
    ...definition.searchableOrder.map((field) =>
      compileSearchableExpression(definition, quoteIdent(`${field}_source`)),
    ),
  ];
  return [
    `INSERT INTO ${docs} (${docCols.join(", ")}) SELECT ${docSelect.join(", ")} FROM ${source}`,
    `INSERT INTO ${fts} (${ftsCols.join(", ")}) SELECT ${ftsSelect.join(", ")} FROM ${docs}`,
  ];
}

function storageSql(kind: string): string {
  switch (kind) {
    case "safe-integer":
    case "boolean-integer":
    case "timestamp-integer":
      return "INTEGER";
    case "finite-real":
      return "REAL";
    default:
      return "TEXT";
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
