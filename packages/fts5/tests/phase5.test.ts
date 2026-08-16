import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { defineIndex, physicalIndexIdFor, quoteIdent, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  applyProjectionMigration,
  assertSecureDeletePolicy,
  compileFtsDdl,
  createIndex,
  incrementalOptimize,
  mergeFtsIndex,
  physicalNames,
  planProjectionMigration,
  probeFts5Capabilities,
  readRegistry,
} from "../src/index.ts";

function baseDefinition() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 1 } },
    filterable: { status: "text" },
  });
}

function nextDefinition() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 1 } },
    filterable: { status: "text", category: "text" },
  });
}

describe("projection migration and maintenance", () => {
  test("adding a projected field is migration-only and backfills existing rows", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT, category TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status, category) VALUES (?, ?, ?, ?)", [
        "p1",
        "sqlite",
        "active",
        "db",
      ]),
    );
    const previous = baseDefinition();
    await createIndex({ adapter, definition: previous });
    const plan = planProjectionMigration(previous, nextDefinition(), "x", 1);
    expect(plan.change.kind).toBe("migration-only");
    expect(plan.addColumns.map((column) => column.field)).toEqual(["category"]);

    const result = await applyProjectionMigration({
      adapter,
      previous,
      next: nextDefinition(),
      chunk: { afterDocId: 0, limit: 500 },
    });
    expect(result.resumeToken).toBeNull();
    const registry = await readRegistry(adapter, "products");
    expect(registry?.health).toBe("healthy");
    const names = physicalNames(
      nextDefinition(),
      registry?.physicalIndexId ?? physicalIndexIdFor("products"),
      registry?.activeGeneration ?? 1,
    );
    const rows = await adapter.query<{ category: string }>(
      sql(`SELECT ${quoteIdent("category")} FROM ${quoteIdent(names.docs)}`),
    );
    expect(rows[0]?.category).toBe("db");
  });

  test("interrupted backfill can resume and does not lie about completion", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT, category TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status, category) VALUES (?, ?, ?, ?)", [
        "p1",
        "sqlite",
        "active",
        "db",
      ]),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status, category) VALUES (?, ?, ?, ?)", [
        "p2",
        "fts5",
        "active",
        "search",
      ]),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status, category) VALUES (?, ?, ?, ?)", [
        "p3",
        "libsql",
        "active",
        "edge",
      ]),
    );
    await createIndex({ adapter, definition: baseDefinition() });
    const first = await applyProjectionMigration({
      adapter,
      previous: baseDefinition(),
      next: nextDefinition(),
      chunk: { afterDocId: 0, limit: 1 },
    });
    expect(first.resumeToken).not.toBeNull();
    expect(first.resumeToken?.startsWith("doc_id:")).toBe(true);
    const pending = await readRegistry(adapter, "products");
    expect(pending?.health).toBe("pending");

    const names = physicalNames(
      nextDefinition(),
      pending?.physicalIndexId ?? physicalIndexIdFor("products"),
      pending?.activeGeneration ?? 1,
    );
    const mid = await adapter.query<{ category: string | null }>(
      sql(
        `SELECT ${quoteIdent("category")} FROM ${quoteIdent(names.docs)} ORDER BY ${quoteIdent("doc_id")}`,
      ),
    );
    expect(mid.filter((row) => row.category != null).length).toBe(1);

    const afterDocId = Number((first.resumeToken ?? "").slice("doc_id:".length));
    const second = await applyProjectionMigration({
      adapter,
      previous: baseDefinition(),
      next: nextDefinition(),
      chunk: { afterDocId, limit: 500 },
    });
    expect(second.resumeToken).toBeNull();
    const healthy = await readRegistry(adapter, "products");
    expect(healthy?.health).toBe("healthy");
    const rows = await adapter.query<{ category: string | null }>(
      sql(`SELECT ${quoteIdent("category")} FROM ${quoteIdent(names.docs)}`),
    );
    expect(rows.length).toBe(3);
    expect(rows.every((row) => row.category != null && row.category.length > 0)).toBe(true);
  });

  test("bounded merge and incremental optimize run without full optimize", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"),
    );
    await createIndex({ adapter, definition: baseDefinition() });
    const merged = await mergeFtsIndex({
      adapter,
      definition: baseDefinition(),
      pageBudget: 2,
    });
    expect(merged.pageBudget).toBe(2);
    expect(merged.workRemaining).toBe(false);
    const optimized = await incrementalOptimize({
      adapter,
      definition: baseDefinition(),
      pageBudget: 2,
    });
    expect(optimized.pageBudget).toBe(2);
    expect(optimized.workRemaining).toBe(false);
  });

  test("secure-delete required policy fails closed when unsupported", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"),
    );
    await assertSecureDeletePolicy(adapter, "off");
    expect(compileFtsDdl(baseDefinition(), "x", 1, { secureDelete: true })).toContain(
      "secure-delete=1",
    );
    expect(compileFtsDdl(baseDefinition(), "x", 1)).not.toContain("secure-delete=1");

    const probes = await probeFts5Capabilities(adapter);
    if (probes.fts5SecureDelete !== true) {
      try {
        await assertSecureDeletePolicy(adapter, "required-if-supported");
        throw new Error("expected SEARCH_CAPABILITY_UNSUPPORTED");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as { code?: string }).code).toBe("SEARCH_CAPABILITY_UNSUPPORTED");
      }
      return;
    }

    await createIndex({
      adapter,
      definition: baseDefinition(),
      secureDelete: "required-if-supported",
    });
    const registry = await readRegistry(adapter, "products");
    const names = physicalNames(
      baseDefinition(),
      registry?.physicalIndexId ?? physicalIndexIdFor("products"),
      registry?.activeGeneration ?? 1,
    );
    const ddl = await adapter.query<{ sql: string | null }>(
      sql(`SELECT sql FROM sqlite_master WHERE name = ?`, [names.fts]),
    );
    expect(ddl[0]?.sql ?? "").toContain("secure-delete=1");
  });
});
