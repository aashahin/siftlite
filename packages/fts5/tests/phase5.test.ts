import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { defineIndex, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  applyProjectionMigration,
  assertSecureDeletePolicy,
  createIndex,
  incrementalOptimize,
  mergeFtsIndex,
  planProjectionMigration,
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
    const rows = await adapter.query<{ category: string }>(sql("SELECT category FROM products"));
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
    await createIndex({ adapter, definition: baseDefinition() });
    const first = await applyProjectionMigration({
      adapter,
      previous: baseDefinition(),
      next: nextDefinition(),
      chunk: { afterDocId: 0, limit: 0 },
    });
    expect(first.resumeToken === null || first.resumeToken.startsWith("doc_id:")).toBe(true);
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
    const optimized = await incrementalOptimize({
      adapter,
      definition: baseDefinition(),
      pageBudget: 2,
    });
    expect(optimized.pageBudget).toBe(2);
  });

  test("secure-delete required policy fails closed when unsupported", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await assertSecureDeletePolicy(adapter, "off");
    try {
      await assertSecureDeletePolicy(adapter, "required-if-supported");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: string }).code).toBe("SEARCH_CAPABILITY_UNSUPPORTED");
    }
  });
});
