import {
  classifyPhysicalChange,
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
import { readRegistry, writeRegistry } from "./registry-sql.js";
import { hashLogicalDefinition } from "@siftlite/core";

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
  const names = physicalNames(args.next, row.physicalIndexId, row.activeGeneration);
  for (const column of plan.addColumns) {
    await args.adapter.execute(
      sql(
        `ALTER TABLE ${quoteIdent(names.docs)} ADD COLUMN ${quoteIdent(column.field)} ${column.sqlType}`,
      ),
    );
  }
  let resumeToken = plan.resumeToken;
  if (args.next.mode === "linked" && args.next.source && plan.addColumns.length > 0) {
    const chunk = args.chunk ?? { afterDocId: 0, limit: 500 };
    const assignments = plan.addColumns
      .map(
        (column) =>
          `${quoteIdent(column.field)} = (SELECT ${quoteIdent(column.field)} FROM ${quoteIdent(args.next.source?.table ?? "")} s WHERE s.${quoteIdent(args.next.source?.primaryKey.field ?? "id")} = d.${quoteIdent("source_id")})`,
      )
      .join(", ");
    await args.adapter.execute(
      sql(
        `UPDATE ${quoteIdent(names.docs)} AS d SET ${assignments} WHERE d.${quoteIdent("doc_id")} > ? AND d.${quoteIdent("doc_id")} <= ?`,
        [chunk.afterDocId, chunk.afterDocId + chunk.limit],
      ),
    );
    const max = await args.adapter.query<{ max_id: number | null }>(
      sql(`SELECT MAX(${quoteIdent("doc_id")}) AS max_id FROM ${quoteIdent(names.docs)}`),
    );
    const maxId = max[0]?.max_id ?? 0;
    resumeToken =
      chunk.afterDocId + chunk.limit >= maxId ? null : `doc_id:${chunk.afterDocId + chunk.limit}`;
    for (const column of plan.addColumns) {
      await args.adapter.execute(
        sql(
          `CREATE INDEX ${quoteIdent(`${names.docs}_${column.field}`)} ON ${quoteIdent(names.docs)} (${quoteIdent(column.field)})`,
        ),
      );
    }
    const triggers = triggerNames(names.docs);
    for (const name of [triggers.insert, triggers.update, triggers.delete]) {
      await args.adapter.execute(sql(`DROP TRIGGER ${quoteIdent(name)}`));
    }
    for (const statement of compileLinkedTriggers(
      args.next,
      row.physicalIndexId,
      row.activeGeneration,
    )) {
      await args.adapter.execute(sql(statement));
    }
  }
  if (resumeToken !== null) {
    return { resumeToken };
  }
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
