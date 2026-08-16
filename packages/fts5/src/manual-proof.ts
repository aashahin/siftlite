import {
  assertSourceId,
  DEFAULT_APPLICATION_LIMITS,
  normalizeIndexText,
  parseIndexTextQuery,
  quoteIdent,
  SearchError,
  sql,
  sourceIdKind,
  validateFilter,
  type ApplicationLimits,
  type BoundScope,
  type FilterNode,
  type IndexDefinition,
  type MatchingStrategy,
  type PortableScalar,
  type SearchSort,
  type SourceId,
  type SqlAdapter,
  type SqlStatement,
} from "@siftlite/core";
import { sqliteFts5 } from "./backend.js";
import { compileFts5PhysicalManifest } from "./manifest.js";
import { physicalNames, sourceIdColumnType } from "./names.js";
import { publicScoreFromFts5Bm25 } from "./score.js";
import { restoreSourceId } from "./search/hydrate.js";

export interface ManualProofDocument {
  readonly id: SourceId;
  readonly searchable: Readonly<Record<string, string>>;
  readonly filterable?: Readonly<Record<string, PortableScalar | null>>;
}

export interface ProofSearchHit {
  readonly id: SourceId;
  readonly score: number | null;
}

export interface ProofSearchOptions {
  readonly filter?: FilterNode;
  readonly sort?: readonly SearchSort[];
  readonly limit?: number;
  readonly offset?: number;
  readonly matchingStrategy?: MatchingStrategy;
  readonly scope?: BoundScope;
}

export interface ManualFts5Proof {
  readonly physicalIndexId: string;
  readonly generation: number;
  upsert(documents: readonly ManualProofDocument[]): Promise<void>;
  delete(id: SourceId): Promise<void>;
  search(query: string, options?: ProofSearchOptions): Promise<readonly ProofSearchHit[]>;
}

export async function createManualFts5Proof(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly physicalIndexId?: string;
  readonly generation?: number;
  readonly limits?: ApplicationLimits;
  readonly existingSchema?: boolean;
}): Promise<ManualFts5Proof> {
  if (args.definition.mode !== "manual") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "FTS5 proof helper requires a manual index",
      details: { reason: "manual-only" },
    });
  }
  const physicalIndexId = args.physicalIndexId ?? "proof";
  const generation = args.generation ?? 1;
  const limits = args.limits ?? DEFAULT_APPLICATION_LIMITS;
  const definition = args.definition;
  const names = physicalNames(definition, physicalIndexId, generation);
  const backend = sqliteFts5();
  const physical = compileFts5PhysicalManifest({ definition, physicalIndexId, generation });

  if (args.existingSchema !== true) {
    await createSchema(args.adapter, definition, names);
  }

  return {
    physicalIndexId,
    generation,
    async upsert(documents) {
      if (args.adapter.batch) {
        await upsertDocumentsBatched(args.adapter, definition, names, documents);
        return;
      }
      for (const document of documents) {
        await upsertDocument(args.adapter, definition, names, document);
      }
    },
    async delete(id) {
      const sourceId = assertSourceId(id);
      const rows = await args.adapter.query<{ doc_id: number }>(
        sql(
          `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} = ?`,
          [sourceId],
        ),
      );
      const docId = rows[0]?.doc_id;
      if (docId === undefined) {
        return;
      }
      await args.adapter.execute(
        sql(`DELETE FROM ${quoteIdent(names.fts)} WHERE ${quoteIdent("rowid")} = ?`, [docId]),
      );
      await args.adapter.execute(
        sql(`DELETE FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("doc_id")} = ?`, [docId]),
      );
    },
    async search(query, options = {}) {
      if (options.filter) {
        validateFilter(options.filter, { limits, definition });
      }
      const textQuery = parseIndexTextQuery(query, {
        limits,
        matchingStrategy: options.matchingStrategy ?? definition.matchingStrategy,
        normalization: definition.normalization,
      });
      const compiled = backend.compileSearch({
        definition,
        physical,
        physicalIndexId,
        generation,
        textQuery,
        ...(options.filter ? { filter: options.filter } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.sort ? { sort: options.sort } : {}),
        limit: options.limit ?? limits.defaultLimit,
        offset: options.offset ?? 0,
        limits,
        runtimeLimits: args.adapter.runtimeCapabilities.limits,
      });
      const rows = await args.adapter.query<{ source_id: SourceId; rank: number | null }>(
        compiled.statement,
      );
      return rows.map((row) => ({
        id: restoreSourceId(definition, row.source_id),
        score: compiled.emptyQuery || row.rank === null ? null : publicScoreFromFts5Bm25(row.rank),
      }));
    },
  };
}

async function createSchema(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
): Promise<void> {
  const projected = unique([...definition.filterableOrder, ...definition.sortableOrder]).map(
    (field) => {
      const spec = definition.filterable[field] ?? definition.sortable[field];
      return `${quoteIdent(field)} ${sqlType(spec?.storageKind ?? "text")}`;
    },
  );
  const docsColumns = [
    `${quoteIdent("doc_id")} INTEGER PRIMARY KEY`,
    `${quoteIdent("source_id")} ${sourceIdColumnType(definition)} NOT NULL UNIQUE`,
    ...definition.searchableOrder.map((field) => `${quoteIdent(`${field}_source`)} TEXT`),
    ...projected,
  ];
  await adapter.execute(sql(`CREATE TABLE ${quoteIdent(names.docs)} (${docsColumns.join(", ")})`));

  const prefix = definition.prefix.length > 0 ? `, prefix='${definition.prefix.join(" ")}'` : "";
  const ftsColumns = definition.searchableOrder.map((field) => quoteIdent(field)).join(", ");
  await adapter.execute(
    sql(
      `CREATE VIRTUAL TABLE ${quoteIdent(names.fts)} USING fts5(${ftsColumns}${prefix}, tokenize='unicode61')`,
    ),
  );
}

async function upsertDocument(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  document: ManualProofDocument,
): Promise<void> {
  const sourceId = assertSourceId(document.id);
  if (
    definition.source?.primaryKey.type === "safe-integer" &&
    sourceIdKind(sourceId) !== "safe-integer"
  ) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "numeric index requires a safe-integer source ID",
      details: { reason: "source-id-kind" },
    });
  }
  if (definition.source?.primaryKey.type === "string" && sourceIdKind(sourceId) !== "string") {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "string index requires a string source ID",
      details: { reason: "source-id-kind" },
    });
  }

  const existing = await adapter.query<{ doc_id: number }>(
    sql(
      `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} = ?`,
      [sourceId],
    ),
  );

  const projectedFields = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const searchableValues = definition.searchableOrder.map(
    (field) => document.searchable[field] ?? "",
  );
  const normalizedSearchable = searchableValues.map((value) =>
    normalizeIndexText(value, definition.normalization),
  );
  const projectedValues = projectedFields.map((field) => document.filterable?.[field] ?? null);

  let docId = existing[0]?.doc_id;
  if (docId === undefined) {
    const columns = [
      quoteIdent("source_id"),
      ...definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)),
      ...projectedFields.map((field) => quoteIdent(field)),
    ];
    const placeholders = columns.map(() => "?").join(", ");
    await adapter.execute(
      sql(
        `INSERT INTO ${quoteIdent(names.docs)} (${columns.join(", ")}) VALUES (${placeholders})`,
        [sourceId, ...searchableValues, ...projectedValues],
      ),
    );
    const inserted = await adapter.query<{ doc_id: number }>(
      sql(
        `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} = ?`,
        [sourceId],
      ),
    );
    docId = inserted[0]?.doc_id;
    if (docId === undefined) {
      throw new SearchError({
        code: "SEARCH_BACKEND_ERROR",
        message: "failed to allocate doc_id",
        details: { reason: "missing-doc-id" },
      });
    }
    await adapter.execute(
      sql(
        `INSERT INTO ${quoteIdent(names.fts)} (${quoteIdent("rowid")}, ${definition.searchableOrder.map((field) => quoteIdent(field)).join(", ")}) VALUES (${["?", ...searchableValues.map(() => "?")].join(", ")})`,
        [docId, ...normalizedSearchable],
      ),
    );
    return;
  }

  const assignments = [
    ...definition.searchableOrder.map((field) => `${quoteIdent(`${field}_source`)} = ?`),
    ...projectedFields.map((field) => `${quoteIdent(field)} = ?`),
  ];
  await adapter.execute(
    sql(
      `UPDATE ${quoteIdent(names.docs)} SET ${assignments.join(", ")} WHERE ${quoteIdent("doc_id")} = ?`,
      [...searchableValues, ...projectedValues, docId],
    ),
  );
  const ftsAssignments = definition.searchableOrder.map((field) => `${quoteIdent(field)} = ?`);
  await adapter.execute(
    sql(
      `UPDATE ${quoteIdent(names.fts)} SET ${ftsAssignments.join(", ")} WHERE ${quoteIdent("rowid")} = ?`,
      [...normalizedSearchable, docId],
    ),
  );
}

async function upsertDocumentsBatched(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  documents: readonly ManualProofDocument[],
): Promise<void> {
  if (documents.length === 0) {
    return;
  }
  const prepared = documents.map((document) => prepareManualDocument(definition, document));
  const existing = await loadExistingDocIds(
    adapter,
    definition,
    names,
    prepared.map((item) => item.sourceId),
  );
  let nextDocId = await nextAvailableDocId(adapter, names);
  const statements: SqlStatement[] = [];
  for (const item of prepared) {
    const existingId = existing.get(item.sourceId);
    if (existingId === undefined) {
      const docId = nextDocId;
      nextDocId += 1;
      statements.push(insertDocsStatement(definition, names, item, docId));
      statements.push(insertFtsStatement(definition, names, item, docId));
    } else {
      statements.push(updateDocsStatement(definition, names, item, existingId));
      statements.push(updateFtsStatement(definition, names, item, existingId));
    }
  }
  if (statements.length === 0) {
    return;
  }
  const batch = adapter.batch;
  if (!batch) {
    throw new SearchError({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      message: "adapter.batch is required for batched manual upsert",
      details: { reason: "batch" },
    });
  }
  await batch.call(adapter, statements);
}

interface PreparedManualDocument {
  readonly sourceId: SourceId;
  readonly searchableValues: readonly string[];
  readonly normalizedSearchable: readonly string[];
  readonly projectedValues: readonly (PortableScalar | null)[];
}

function prepareManualDocument(
  definition: IndexDefinition,
  document: ManualProofDocument,
): PreparedManualDocument {
  const sourceId = assertSourceId(document.id);
  if (
    definition.source?.primaryKey.type === "safe-integer" &&
    sourceIdKind(sourceId) !== "safe-integer"
  ) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "numeric index requires a safe-integer source ID",
      details: { reason: "source-id-kind" },
    });
  }
  if (definition.source?.primaryKey.type === "string" && sourceIdKind(sourceId) !== "string") {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "string index requires a string source ID",
      details: { reason: "source-id-kind" },
    });
  }
  const projectedFields = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const searchableValues = definition.searchableOrder.map(
    (field) => document.searchable[field] ?? "",
  );
  return {
    sourceId,
    searchableValues,
    normalizedSearchable: searchableValues.map((value) =>
      normalizeIndexText(value, definition.normalization),
    ),
    projectedValues: projectedFields.map((field) => document.filterable?.[field] ?? null),
  };
}

async function loadExistingDocIds(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  ids: readonly SourceId[],
): Promise<Map<SourceId, number>> {
  const found = new Map<SourceId, number>();
  if (ids.length === 0) {
    return found;
  }
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await adapter.query<{ source_id: unknown; doc_id: number }>(
    sql(
      `SELECT ${quoteIdent("source_id")} AS source_id, ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} IN (${placeholders})`,
      [...ids],
    ),
  );
  for (const row of rows) {
    found.set(restoreSourceId(definition, row.source_id), row.doc_id);
  }
  return found;
}

async function nextAvailableDocId(
  adapter: SqlAdapter,
  names: ReturnType<typeof physicalNames>,
): Promise<number> {
  const rows = await adapter.query<{ max_id: number | null }>(
    sql(`SELECT MAX(${quoteIdent("doc_id")}) AS max_id FROM ${quoteIdent(names.docs)}`),
  );
  return Number(rows[0]?.max_id ?? 0) + 1;
}

function insertDocsStatement(
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  document: PreparedManualDocument,
  docId: number,
): SqlStatement {
  const projectedFields = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const columns = [
    quoteIdent("doc_id"),
    quoteIdent("source_id"),
    ...definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)),
    ...projectedFields.map((field) => quoteIdent(field)),
  ];
  const placeholders = columns.map(() => "?").join(", ");
  return sql(
    `INSERT INTO ${quoteIdent(names.docs)} (${columns.join(", ")}) VALUES (${placeholders})`,
    [docId, document.sourceId, ...document.searchableValues, ...document.projectedValues],
  );
}

function insertFtsStatement(
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  document: PreparedManualDocument,
  docId: number,
): SqlStatement {
  return sql(
    `INSERT INTO ${quoteIdent(names.fts)} (${quoteIdent("rowid")}, ${definition.searchableOrder.map((field) => quoteIdent(field)).join(", ")}) VALUES (${["?", ...document.normalizedSearchable.map(() => "?")].join(", ")})`,
    [docId, ...document.normalizedSearchable],
  );
}

function updateDocsStatement(
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  document: PreparedManualDocument,
  docId: number,
): SqlStatement {
  const projectedFields = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const assignments = [
    ...definition.searchableOrder.map((field) => `${quoteIdent(`${field}_source`)} = ?`),
    ...projectedFields.map((field) => `${quoteIdent(field)} = ?`),
  ];
  return sql(
    `UPDATE ${quoteIdent(names.docs)} SET ${assignments.join(", ")} WHERE ${quoteIdent("doc_id")} = ?`,
    [...document.searchableValues, ...document.projectedValues, docId],
  );
}

function updateFtsStatement(
  definition: IndexDefinition,
  names: ReturnType<typeof physicalNames>,
  document: PreparedManualDocument,
  docId: number,
): SqlStatement {
  const ftsAssignments = definition.searchableOrder.map((field) => `${quoteIdent(field)} = ?`);
  return sql(
    `UPDATE ${quoteIdent(names.fts)} SET ${ftsAssignments.join(", ")} WHERE ${quoteIdent("rowid")} = ?`,
    [...document.normalizedSearchable, docId],
  );
}

function sqlType(kind: string): string {
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
