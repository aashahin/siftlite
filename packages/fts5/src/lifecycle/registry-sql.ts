import {
  quoteIdent,
  REGISTRY_TABLE,
  SearchError,
  sql,
  type RegistryRow,
  type SqlAdapter,
} from "@siftlite/core";

export const REGISTRY_SQL_COLUMNS = [
  "index_name",
  "physical_index_id",
  "active_generation",
  "definition_hash",
  "physical_schema_version",
  "physical_schema_hash",
  "backend",
  "source_table",
  "mode",
  "created_at",
  "updated_at",
  "health",
] as const;

export function compileEnsureRegistrySql(): string {
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(REGISTRY_TABLE)} (
      index_name TEXT PRIMARY KEY,
      physical_index_id TEXT NOT NULL UNIQUE,
      active_generation INTEGER NOT NULL,
      definition_hash TEXT NOT NULL,
      physical_schema_version INTEGER NOT NULL,
      physical_schema_hash TEXT NOT NULL,
      backend TEXT NOT NULL,
      source_table TEXT,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      health TEXT NOT NULL
    )`;
}

export async function ensureRegistry(adapter: SqlAdapter): Promise<void> {
  await adapter.execute(sql(compileEnsureRegistrySql()));
  const columns = await adapter.query<{ name: string }>(
    sql(`PRAGMA table_info(${quoteIdent(REGISTRY_TABLE)})`),
  );
  const present = new Set(columns.map((column) => column.name));
  const missing = REGISTRY_SQL_COLUMNS.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new SearchError({
      code: "SEARCH_MAINTENANCE_FAILED",
      message: "registry table is missing required columns",
      details: { reason: "registry-schema-drift" },
    });
  }
}

export async function readRegistry(
  adapter: SqlAdapter,
  indexName: string,
): Promise<RegistryRow | null> {
  const rows = await adapter.query<{
    index_name: string;
    physical_index_id: string;
    active_generation: number;
    definition_hash: string;
    physical_schema_version: number;
    physical_schema_hash: string;
    backend: string;
    source_table: string | null;
    mode: "linked" | "manual";
    created_at: number;
    updated_at: number;
    health: "healthy" | "pending";
  }>(
    sql(
      `SELECT ${REGISTRY_SQL_COLUMNS.join(", ")}
       FROM ${quoteIdent(REGISTRY_TABLE)} WHERE index_name = ?`,
      [indexName],
    ),
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    indexName: row.index_name,
    physicalIndexId: row.physical_index_id,
    activeGeneration: row.active_generation,
    definitionHash: row.definition_hash,
    physicalSchemaVersion: row.physical_schema_version,
    physicalSchemaHash: row.physical_schema_hash,
    backend: row.backend,
    sourceTable: row.source_table,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    health: row.health,
  };
}

export async function writePendingRegistry(adapter: SqlAdapter, row: RegistryRow): Promise<void> {
  await writeRegistry(adapter, {
    ...row,
    health: "pending",
  });
}

export async function writeRegistry(adapter: SqlAdapter, row: RegistryRow): Promise<void> {
  await adapter.execute(
    sql(
      `INSERT INTO ${quoteIdent(REGISTRY_TABLE)} (
        ${REGISTRY_SQL_COLUMNS.join(", ")}
      ) VALUES (${REGISTRY_SQL_COLUMNS.map(() => "?").join(", ")})
      ON CONFLICT(index_name) DO UPDATE SET
        physical_index_id = excluded.physical_index_id,
        active_generation = excluded.active_generation,
        definition_hash = excluded.definition_hash,
        physical_schema_version = excluded.physical_schema_version,
        physical_schema_hash = excluded.physical_schema_hash,
        backend = excluded.backend,
        source_table = excluded.source_table,
        mode = excluded.mode,
        updated_at = excluded.updated_at,
        health = excluded.health`,
      [
        row.indexName,
        row.physicalIndexId,
        row.activeGeneration,
        row.definitionHash,
        row.physicalSchemaVersion,
        row.physicalSchemaHash,
        row.backend,
        row.sourceTable,
        row.mode,
        row.createdAt,
        row.updatedAt,
        row.health,
      ],
    ),
  );
}

export async function deleteRegistry(adapter: SqlAdapter, indexName: string): Promise<void> {
  await adapter.execute(
    sql(`DELETE FROM ${quoteIdent(REGISTRY_TABLE)} WHERE index_name = ?`, [indexName]),
  );
}
