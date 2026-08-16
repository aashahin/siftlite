import {
  hashLogicalDefinition,
  hashPhysicalManifest,
  physicalIndexIdFor,
  quoteIdent,
  SearchError,
  sql,
  type IndexDefinition,
  type SqlAdapter,
} from "@siftlite/core";
import { compileFts5PhysicalManifest } from "../manifest.js";
import { physicalNames } from "../names.js";
import { compileSearchableExpression } from "../normalize-sql.js";
import { compileDocsDdl, compileFtsDdl, compileProjectionIndexes } from "./schema.js";
import {
  deleteRegistry,
  ensureRegistry,
  readRegistry,
  writePendingRegistry,
  writeRegistry,
} from "./registry-sql.js";
import { compileLinkedTriggers, triggerNames } from "./triggers.js";
import { assertSecureDeletePolicy, type SecureDeletePolicy } from "./maintenance.js";
import { verifyOrThrow } from "./verify.js";

const BACKFILL_PAGE = 500;

export interface LifecycleContext {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly now?: number;
  readonly secureDelete?: SecureDeletePolicy;
}

export { verifyOrThrow };

export async function createIndex(ctx: LifecycleContext): Promise<void> {
  await ensureRegistry(ctx.adapter);
  const existing = await readRegistry(ctx.adapter, ctx.definition.name);
  if (existing?.health === "healthy") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "index already exists",
      details: { reason: "already-exists" },
    });
  }
  const physicalIndexId = existing?.physicalIndexId ?? physicalIndexIdFor(ctx.definition.name);
  const generation = existing?.activeGeneration ?? 1;
  const secureDelete = await resolveSecureDelete(ctx);
  if (existing?.health === "pending") {
    await dropPhysical(ctx.adapter, ctx.definition, physicalIndexId, generation);
  }
  await markPending(ctx, physicalIndexId, generation);
  await materialize(ctx, physicalIndexId, generation, secureDelete);
  await verifyOrThrow(ctx, physicalIndexId, generation);
  await writeHealthyRegistry(ctx, physicalIndexId, generation);
}

export async function dropIndex(ctx: LifecycleContext): Promise<void> {
  await ensureRegistry(ctx.adapter);
  const row = await readRegistry(ctx.adapter, ctx.definition.name);
  const physicalIndexId = row?.physicalIndexId ?? physicalIndexIdFor(ctx.definition.name);
  const generation = row?.activeGeneration ?? 1;
  await dropPhysical(ctx.adapter, ctx.definition, physicalIndexId, generation);
  await deleteRegistry(ctx.adapter, ctx.definition.name);
}

export async function rebuildIndex(ctx: LifecycleContext): Promise<void> {
  await ensureRegistry(ctx.adapter);
  const row = await readRegistry(ctx.adapter, ctx.definition.name);
  const physicalIndexId = row?.physicalIndexId ?? physicalIndexIdFor(ctx.definition.name);
  const generation = row?.activeGeneration ?? 1;
  const secureDelete = await resolveSecureDelete(ctx);
  await markPending(ctx, physicalIndexId, generation);
  if (ctx.definition.mode === "manual") {
    const names = physicalNames(ctx.definition, physicalIndexId, generation);
    await ctx.adapter.execute(sql(`DROP TABLE IF EXISTS ${quoteIdent(names.fts)}`));
    await ctx.adapter.execute(
      sql(compileFtsDdl(ctx.definition, physicalIndexId, generation, { secureDelete })),
    );
    const docs = quoteIdent(names.docs);
    const fts = quoteIdent(names.fts);
    const ftsCols = [
      quoteIdent("rowid"),
      ...ctx.definition.searchableOrder.map((field) => quoteIdent(field)),
    ];
    const ftsSelect = [
      quoteIdent("doc_id"),
      ...ctx.definition.searchableOrder.map((field) =>
        compileSearchableExpression(ctx.definition, quoteIdent(`${field}_source`)),
      ),
    ];
    await ctx.adapter.execute(
      sql(`INSERT INTO ${fts} (${ftsCols.join(", ")}) SELECT ${ftsSelect.join(", ")} FROM ${docs}`),
    );
    await verifyOrThrow(ctx, physicalIndexId, generation);
    await writeHealthyRegistry(ctx, physicalIndexId, generation);
    return;
  }
  const nextGeneration = generation + (row ? 1 : 0);
  await dropPhysical(ctx.adapter, ctx.definition, physicalIndexId, nextGeneration);
  await materialize(ctx, physicalIndexId, nextGeneration, secureDelete);
  await verifyOrThrow(ctx, physicalIndexId, nextGeneration);
  await writeHealthyRegistry(ctx, physicalIndexId, nextGeneration);
  if (row) {
    await dropPhysical(ctx.adapter, ctx.definition, physicalIndexId, row.activeGeneration);
  }
}

async function materialize(
  ctx: LifecycleContext,
  physicalIndexId: string,
  generation: number,
  secureDelete: boolean,
): Promise<void> {
  await ctx.adapter.execute(sql(compileDocsDdl(ctx.definition, physicalIndexId, generation)));
  for (const statement of compileProjectionIndexes(ctx.definition, physicalIndexId, generation)) {
    await ctx.adapter.execute(sql(statement));
  }
  await ctx.adapter.execute(
    sql(compileFtsDdl(ctx.definition, physicalIndexId, generation, { secureDelete })),
  );
  if (ctx.definition.mode === "linked") {
    for (const statement of compileLinkedTriggers(ctx.definition, physicalIndexId, generation)) {
      await ctx.adapter.execute(sql(statement));
    }
    await backfillLinked(ctx, physicalIndexId, generation);
  }
}

async function backfillLinked(
  ctx: LifecycleContext,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const definition = ctx.definition;
  if (!definition.source) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "linked backfill requires a source table",
      details: { reason: "missing-source" },
    });
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

  let sourceCursor: string | number | null = null;
  for (;;) {
    const page =
      sourceCursor === null
        ? await ctx.adapter.query<{ pk: string | number }>(
            sql(`SELECT ${pk} AS pk FROM ${source} ORDER BY ${pk} LIMIT ?`, [BACKFILL_PAGE]),
          )
        : await ctx.adapter.query<{ pk: string | number }>(
            sql(`SELECT ${pk} AS pk FROM ${source} WHERE ${pk} > ? ORDER BY ${pk} LIMIT ?`, [
              sourceCursor,
              BACKFILL_PAGE,
            ]),
          );
    const last = page[page.length - 1];
    if (!last) {
      break;
    }
    await ctx.adapter.execute(
      sourceCursor === null
        ? sql(
            `INSERT INTO ${docs} (${docCols.join(", ")}) SELECT ${docSelect.join(", ")} FROM ${source} WHERE ${pk} <= ?`,
            [last.pk],
          )
        : sql(
            `INSERT INTO ${docs} (${docCols.join(", ")}) SELECT ${docSelect.join(", ")} FROM ${source} WHERE ${pk} > ? AND ${pk} <= ?`,
            [sourceCursor, last.pk],
          ),
    );
    sourceCursor = last.pk;
  }

  let afterDocId = 0;
  for (;;) {
    const page = await ctx.adapter.query<{ doc_id: number }>(
      sql(
        `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${docs} WHERE ${quoteIdent("doc_id")} > ? ORDER BY ${quoteIdent("doc_id")} LIMIT ?`,
        [afterDocId, BACKFILL_PAGE],
      ),
    );
    const last = page[page.length - 1];
    if (!last) {
      break;
    }
    await ctx.adapter.execute(
      sql(
        `INSERT INTO ${fts} (${ftsCols.join(", ")}) SELECT ${ftsSelect.join(", ")} FROM ${docs} WHERE ${quoteIdent("doc_id")} > ? AND ${quoteIdent("doc_id")} <= ?`,
        [afterDocId, last.doc_id],
      ),
    );
    afterDocId = last.doc_id;
  }
}

async function dropPhysical(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const names = physicalNames(definition, physicalIndexId, generation);
  if (definition.mode === "linked" && definition.source) {
    const triggers = triggerNames(names.docs);
    for (const name of [triggers.insert, triggers.update, triggers.delete]) {
      await adapter.execute(sql(`DROP TRIGGER IF EXISTS ${quoteIdent(name)}`));
    }
  }
  await adapter.execute(sql(`DROP TABLE IF EXISTS ${quoteIdent(names.fts)}`));
  await adapter.execute(sql(`DROP TABLE IF EXISTS ${quoteIdent(names.docs)}`));
}

async function markPending(
  ctx: LifecycleContext,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const now = ctx.now ?? Date.now();
  const existing = await readRegistry(ctx.adapter, ctx.definition.name);
  if (existing) {
    await writePendingRegistry(ctx.adapter, { ...existing, updatedAt: now });
    return;
  }
  const manifest = compileFts5PhysicalManifest({
    definition: ctx.definition,
    physicalIndexId,
    generation,
  });
  await writePendingRegistry(ctx.adapter, {
    indexName: ctx.definition.name,
    physicalIndexId,
    activeGeneration: generation,
    definitionHash: hashLogicalDefinition(ctx.definition),
    physicalSchemaVersion: manifest.version,
    physicalSchemaHash: hashPhysicalManifest(manifest),
    backend: "fts5",
    sourceTable: ctx.definition.source?.table ?? null,
    mode: ctx.definition.mode,
    createdAt: now,
    updatedAt: now,
    health: "pending",
  });
}

async function writeHealthyRegistry(
  ctx: LifecycleContext,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const now = ctx.now ?? Date.now();
  const manifest = compileFts5PhysicalManifest({
    definition: ctx.definition,
    physicalIndexId,
    generation,
  });
  const existing = await readRegistry(ctx.adapter, ctx.definition.name);
  await writeRegistry(ctx.adapter, {
    indexName: ctx.definition.name,
    physicalIndexId,
    activeGeneration: generation,
    definitionHash: hashLogicalDefinition(ctx.definition),
    physicalSchemaVersion: manifest.version,
    physicalSchemaHash: hashPhysicalManifest(manifest),
    backend: "fts5",
    sourceTable: ctx.definition.source?.table ?? null,
    mode: ctx.definition.mode,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    health: "healthy",
  });
}

export async function syncRuntimeDefinition(
  ctx: LifecycleContext,
): Promise<"runtime-only" | "physical-changed"> {
  await ensureRegistry(ctx.adapter);
  const row = await readRegistry(ctx.adapter, ctx.definition.name);
  if (!row) {
    throw new SearchError({
      code: "SEARCH_INDEX_NOT_FOUND",
      message: "index is not registered",
      details: { reason: "missing-registry" },
    });
  }
  const nextManifest = compileFts5PhysicalManifest({
    definition: ctx.definition,
    physicalIndexId: row.physicalIndexId,
    generation: row.activeGeneration,
  });
  if (row.physicalSchemaHash !== hashPhysicalManifest(nextManifest)) {
    return "physical-changed";
  }
  await writeHealthyRegistry(ctx, row.physicalIndexId, row.activeGeneration);
  return "runtime-only";
}

async function resolveSecureDelete(ctx: LifecycleContext): Promise<boolean> {
  const policy = ctx.secureDelete ?? "off";
  if (policy === "off") {
    return false;
  }
  await assertSecureDeletePolicy(ctx.adapter, policy);
  return true;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
