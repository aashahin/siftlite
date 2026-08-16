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
import { compileBackfillSql, compileDocsDdl, compileFtsDdl } from "./schema.js";
import { deleteRegistry, ensureRegistry, readRegistry, writeRegistry } from "./registry-sql.js";
import { compileLinkedTriggers, triggerNames } from "./triggers.js";

export interface LifecycleContext {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly now?: number;
}

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
  await materialize(ctx, physicalIndexId, generation);
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
  if (ctx.definition.mode === "manual") {
    const names = physicalNames(ctx.definition, physicalIndexId, generation);
    await ctx.adapter.execute(sql(`DROP TABLE IF EXISTS ${quoteIdent(names.fts)}`));
    await ctx.adapter.execute(sql(compileFtsDdl(ctx.definition, physicalIndexId, generation)));
    const docs = quoteIdent(names.docs);
    const fts = quoteIdent(names.fts);
    const ftsCols = [
      quoteIdent("rowid"),
      ...ctx.definition.searchableOrder.map((field) => quoteIdent(field)),
    ];
    const ftsSelect = [
      quoteIdent("doc_id"),
      ...ctx.definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)),
    ];
    await ctx.adapter.execute(
      sql(`INSERT INTO ${fts} (${ftsCols.join(", ")}) SELECT ${ftsSelect.join(", ")} FROM ${docs}`),
    );
  } else {
    const nextGeneration = generation + (row ? 1 : 0);
    if (row) {
      await dropPhysical(ctx.adapter, ctx.definition, physicalIndexId, row.activeGeneration);
    }
    await materialize(ctx, physicalIndexId, nextGeneration);
  }
  const activeGeneration =
    ctx.definition.mode === "manual" ? generation : generation + (row ? 1 : 0);
  await verifyOrThrow(ctx, physicalIndexId, activeGeneration);
  await writeHealthyRegistry(ctx, physicalIndexId, activeGeneration);
}

async function materialize(
  ctx: LifecycleContext,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  await ctx.adapter.execute(sql(compileDocsDdl(ctx.definition, physicalIndexId, generation)));
  await ctx.adapter.execute(sql(compileFtsDdl(ctx.definition, physicalIndexId, generation)));
  if (ctx.definition.mode === "linked") {
    for (const statement of compileLinkedTriggers(ctx.definition, physicalIndexId, generation)) {
      await ctx.adapter.execute(sql(statement));
    }
    for (const statement of compileBackfillSql(ctx.definition, physicalIndexId, generation)) {
      await ctx.adapter.execute(sql(statement));
    }
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

async function verifyOrThrow(
  ctx: LifecycleContext,
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const names = physicalNames(ctx.definition, physicalIndexId, generation);
  const docs = await tableExists(ctx.adapter, names.docs);
  const fts = await tableExists(ctx.adapter, names.fts);
  if (!docs || !fts) {
    throw new SearchError({
      code: "SEARCH_MAINTENANCE_FAILED",
      message: "physical objects missing after create",
      details: { reason: "missing-physical" },
    });
  }
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

async function tableExists(adapter: SqlAdapter, name: string): Promise<boolean> {
  const rows = await adapter.query<{ name: string }>(
    sql(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`, [name]),
  );
  return rows.length > 0;
}
