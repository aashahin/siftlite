import {
  classifyPhysicalChange,
  hashLogicalDefinition,
  hashPhysicalManifest,
  quoteIdent,
  SearchError,
  sql,
  type IndexDefinition,
  type PhysicalChange,
  type SqlAdapter,
} from "@siftlite/core";
import { compileFts5PhysicalManifest } from "../manifest.js";
import { physicalNames } from "../names.js";
import { compileLinkedTriggers, triggerNames } from "./triggers.js";
import { readRegistry, writePendingRegistry, writeRegistry } from "./registry-sql.js";
import { compileProjectionIndexes, projectionIndexName } from "./schema.js";
import { verifyOrThrow } from "./verify.js";

export interface ProjectionMigrationPlan {
  readonly change: PhysicalChange;
  readonly addColumns: readonly { readonly field: string; readonly sqlType: string }[];
  readonly resumeToken: string | null;
}

export interface BackfillChunk {
  readonly afterDocId: number;
  readonly limit: number;
}

export function planProjectionMigration(
  previous: IndexDefinition,
  next: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): ProjectionMigrationPlan {
  const before = compileFts5PhysicalManifest({ definition: previous, physicalIndexId, generation });
  const after = compileFts5PhysicalManifest({ definition: next, physicalIndexId, generation });
  const change = classifyPhysicalChange(before, after);
  const added = after.projected.filter((field) => !before.projected.includes(field));
  return {
    change,
    addColumns: added.map((field) => ({
      field,
      sqlType: storageSql(
        next.filterable[field]?.storageKind ?? next.sortable[field]?.storageKind ?? "text",
      ),
    })),
    resumeToken: added.length > 0 ? "doc_id:0" : null,
  };
}

export async function applyProjectionMigration(args: {
  readonly adapter: SqlAdapter;
  readonly previous: IndexDefinition;
  readonly next: IndexDefinition;
  readonly sourceColumn?: string;
  readonly chunk?: BackfillChunk;
}): Promise<{ readonly resumeToken: string | null }> {
  const row = await readRegistry(args.adapter, args.next.name);
  if (!row) {
    throw new SearchError({
      code: "SEARCH_INDEX_NOT_FOUND",
      message: "index is not registered",
      details: { reason: "missing-registry" },
    });
  }
  const plan = planProjectionMigration(
    args.previous,
    args.next,
    row.physicalIndexId,
    row.activeGeneration,
  );
  if (plan.change.kind === "rebuild-required" || plan.change.kind === "unsupported") {
    throw new SearchError({
      code: "SEARCH_MIGRATION_REQUIRED",
      message: "projected change is not migration-only",
      details: { reason: plan.change.kind },
    });
  }
  await writePendingRegistry(args.adapter, { ...row, updatedAt: Date.now() });
  const names = physicalNames(args.next, row.physicalIndexId, row.activeGeneration);
  const existingColumns = await args.adapter.query<{ name: string }>(
    sql(`PRAGMA table_info(${quoteIdent(names.docs)})`),
  );
  const present = new Set(existingColumns.map((column) => column.name));
  for (const column of plan.addColumns) {
    if (present.has(column.field)) {
      continue;
    }
    await args.adapter.execute(
      sql(
        `ALTER TABLE ${quoteIdent(names.docs)} ADD COLUMN ${quoteIdent(column.field)} ${column.sqlType}`,
      ),
    );
  }

  let resumeToken: string | null = null;
  if (args.next.mode === "linked" && args.next.source && plan.addColumns.length > 0) {
    const chunk = args.chunk ?? { afterDocId: 0, limit: 500 };
    resumeToken = await backfillProjectionChunk(args, names.docs, plan.addColumns, chunk);
  }

  if (resumeToken !== null) {
    return { resumeToken };
  }

  await createMissingProjectionIndexes(
    args.adapter,
    args.next,
    row.physicalIndexId,
    row.activeGeneration,
  );
  if (args.next.mode === "linked" && args.next.source) {
    const triggers = triggerNames(names.docs);
    for (const name of [triggers.insert, triggers.update, triggers.delete]) {
      await args.adapter.execute(sql(`DROP TRIGGER IF EXISTS ${quoteIdent(name)}`));
    }
    for (const statement of compileLinkedTriggers(
      args.next,
      row.physicalIndexId,
      row.activeGeneration,
    )) {
      await args.adapter.execute(sql(statement));
    }
  }
  await verifyOrThrow(
    { adapter: args.adapter, definition: args.next },
    row.physicalIndexId,
    row.activeGeneration,
  );
  const manifest = compileFts5PhysicalManifest({
    definition: args.next,
    physicalIndexId: row.physicalIndexId,
    generation: row.activeGeneration,
  });
  await writeRegistry(args.adapter, {
    ...row,
    definitionHash: hashLogicalDefinition(args.next),
    physicalSchemaHash: hashPhysicalManifest(manifest),
    updatedAt: Date.now(),
    health: "healthy",
  });
  return { resumeToken: null };
}

async function backfillProjectionChunk(
  args: {
    readonly adapter: SqlAdapter;
    readonly next: IndexDefinition;
  },
  docsTable: string,
  addColumns: readonly { readonly field: string }[],
  chunk: BackfillChunk,
): Promise<string | null> {
  const source = args.next.source;
  if (!source) {
    return null;
  }
  const assignments = addColumns
    .map(
      (column) =>
        `${quoteIdent(column.field)} = (SELECT ${quoteIdent(column.field)} FROM ${quoteIdent(source.table)} s WHERE s.${quoteIdent(source.primaryKey.field)} = d.${quoteIdent("source_id")})`,
    )
    .join(", ");

  if (chunk.limit <= 0) {
    const remaining = await args.adapter.query<{ doc_id: number }>(
      sql(
        `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(docsTable)} WHERE ${quoteIdent("doc_id")} > ? LIMIT 1`,
        [chunk.afterDocId],
      ),
    );
    return remaining.length > 0 ? `doc_id:${chunk.afterDocId}` : null;
  }

  const page = await args.adapter.query<{ doc_id: number }>(
    sql(
      `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(docsTable)} WHERE ${quoteIdent("doc_id")} > ? ORDER BY ${quoteIdent("doc_id")} LIMIT ?`,
      [chunk.afterDocId, chunk.limit],
    ),
  );
  const last = page[page.length - 1];
  if (!last) {
    return null;
  }
  await args.adapter.execute(
    sql(
      `UPDATE ${quoteIdent(docsTable)} AS d SET ${assignments} WHERE d.${quoteIdent("doc_id")} > ? AND d.${quoteIdent("doc_id")} <= ?`,
      [chunk.afterDocId, last.doc_id],
    ),
  );
  const more = await args.adapter.query<{ doc_id: number }>(
    sql(
      `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(docsTable)} WHERE ${quoteIdent("doc_id")} > ? LIMIT 1`,
      [last.doc_id],
    ),
  );
  return more.length > 0 ? `doc_id:${last.doc_id}` : null;
}

async function createMissingProjectionIndexes(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const names = physicalNames(definition, physicalIndexId, generation);
  const statements = compileProjectionIndexes(definition, physicalIndexId, generation);
  const fields = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  for (const [index, field] of fields.entries()) {
    const indexName = projectionIndexName(names.docs, field);
    const existing = await adapter.query<{ name: string }>(
      sql(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`, [indexName]),
    );
    if (existing.length > 0) {
      continue;
    }
    const statement = statements[index];
    if (statement) {
      await adapter.execute(sql(statement));
    }
  }
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
