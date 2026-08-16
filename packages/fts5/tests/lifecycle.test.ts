import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  defineIndex,
  hashLogicalDefinition,
  physicalIndexIdFor,
  quoteIdent,
  SearchError,
  sql,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  checkIndex,
  createIndex,
  createManualFts5Proof,
  doctorIndex,
  dropIndex,
  physicalNames,
  readRegistry,
  rebuildIndex,
  syncRuntimeDefinition,
  writePendingRegistry,
} from "../src/index.ts";

function linkedDefinition() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 5 }, description: { weight: 1 } },
    filterable: { status: "text" },
  });
}

describe("lifecycle", () => {
  test("linked raw SQL CRUD and source-id updates stay synchronized", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p1",
        "sqlite",
        "database",
        "active",
      ]),
    );
    const definition = linkedDefinition();
    await createIndex({ adapter, definition });
    const index = await createManualFts5Proof({
      adapter,
      definition: defineIndex({
        name: "products",
        mode: "manual",
        source: { table: "products", primaryKey: { field: "id", type: "string" } },
        searchable: { name: { weight: 5 }, description: { weight: 1 } },
        filterable: { status: "text" },
      }),
      physicalIndexId: physicalIndexIdFor("products"),
      existingSchema: true,
    });

    expect((await index.search("sqlite")).map((hit) => hit.id)).toEqual(["p1"]);

    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p2",
        "fts5",
        "search",
        "active",
      ]),
    );
    expect((await index.search("fts5")).map((hit) => hit.id)).toEqual(["p2"]);

    await adapter.execute(sql("UPDATE products SET name = ? WHERE id = ?", ["libsql", "p2"]));
    expect((await index.search("fts5")).map((hit) => hit.id)).toEqual([]);
    expect((await index.search("libsql")).map((hit) => hit.id)).toEqual(["p2"]);

    await adapter.execute(sql("UPDATE products SET id = ? WHERE id = ?", ["p9", "p2"]));
    expect((await index.search("libsql")).map((hit) => hit.id)).toEqual(["p9"]);

    await adapter.execute(sql("DELETE FROM products WHERE id = ?", ["p9"]));
    expect((await index.search("libsql")).map((hit) => hit.id)).toEqual([]);

    const check = await checkIndex(adapter, definition);
    expect(check.ok).toBe(true);
  });

  test("linked backfill includes numeric source id 0", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO items (id, name, status) VALUES (?, ?, ?), (?, ?, ?)", [
        0,
        "zero",
        "active",
        1,
        "one",
        "active",
      ]),
    );
    const definition = defineIndex({
      name: "items",
      mode: "linked",
      source: { table: "items", primaryKey: { field: "id", type: "safe-integer" } },
      searchable: { name: { weight: 1 } },
      filterable: { status: "text" },
    });
    await createIndex({ adapter, definition });
    const index = await createManualFts5Proof({
      adapter,
      definition: defineIndex({
        name: "items",
        mode: "manual",
        source: { table: "items", primaryKey: { field: "id", type: "safe-integer" } },
        searchable: { name: { weight: 1 } },
        filterable: { status: "text" },
      }),
      physicalIndexId: physicalIndexIdFor("items"),
      existingSchema: true,
    });
    expect((await index.search("zero")).map((hit) => hit.id)).toEqual([0]);
    expect((await index.search("one")).map((hit) => hit.id)).toEqual([1]);
  });

  test("manual FTS rebuilds from authoritative document rows", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      source: { table: "notes", primaryKey: { field: "id", type: "string" } },
      searchable: { title: { weight: 1 } },
    });
    await createIndex({ adapter, definition });
    const index = await createManualFts5Proof({
      adapter,
      definition,
      physicalIndexId: physicalIndexIdFor("notes"),
      existingSchema: true,
    });
    await index.upsert([{ id: "n1", searchable: { title: "portable search" } }]);
    expect((await index.search("portable")).map((hit) => hit.id)).toEqual(["n1"]);

    const names = physicalNames(definition, physicalIndexIdFor("notes"), 1);
    await adapter.execute(sql(`DROP TABLE "${names.fts}"`));
    const before = await doctorIndex(adapter, definition);
    expect(before.healthy).toBe(false);

    await rebuildIndex({ adapter, definition });
    expect((await index.search("portable")).map((hit) => hit.id)).toEqual(["n1"]);
    expect((await doctorIndex(adapter, definition)).healthy).toBe(true);
  });

  test("runtime-only definition edits keep physical identity", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { title: { weight: 1 } },
      synonyms: { phone: ["iphone"] },
    });
    await createIndex({ adapter, definition });
    const before = await readRegistry(adapter, "notes");
    const edited = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { title: { weight: 1 } },
      synonyms: { phone: ["iphone", "ايفون"] },
    });
    const kind = await syncRuntimeDefinition({ adapter, definition: edited });
    expect(kind).toBe("runtime-only");
    const after = await readRegistry(adapter, "notes");
    expect(after?.physicalIndexId).toBe(before?.physicalIndexId);
    expect(after?.activeGeneration).toBe(before?.activeGeneration);
    expect(after?.physicalSchemaHash).toBe(before?.physicalSchemaHash);
    expect(after?.definitionHash).toBe(hashLogicalDefinition(edited));
    expect(after?.definitionHash).not.toBe(before?.definitionHash);
  });

  test("linked create then rebuild stays searchable on the new generation", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p1",
        "sqlite",
        "database",
        "active",
      ]),
    );
    const definition = linkedDefinition();
    await createIndex({ adapter, definition });
    const before = await readRegistry(adapter, "products");
    expect(before?.health).toBe("healthy");
    const beforeNames = physicalNames(
      definition,
      before?.physicalIndexId ?? physicalIndexIdFor("products"),
      before?.activeGeneration ?? 1,
    );

    await rebuildIndex({ adapter, definition });
    const after = await readRegistry(adapter, "products");
    expect(after?.health).toBe("healthy");
    expect(after?.activeGeneration).toBe((before?.activeGeneration ?? 1) + 1);
    expect(after?.physicalIndexId).toBe(before?.physicalIndexId);

    const oldDocs = await adapter.query<{ name: string }>(
      sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [beforeNames.docs]),
    );
    const oldFts = await adapter.query<{ name: string }>(
      sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [beforeNames.fts]),
    );
    expect(oldDocs).toEqual([]);
    expect(oldFts).toEqual([]);

    const index = await createManualFts5Proof({
      adapter,
      definition: defineIndex({
        name: "products",
        mode: "manual",
        source: { table: "products", primaryKey: { field: "id", type: "string" } },
        searchable: { name: { weight: 5 }, description: { weight: 1 } },
        filterable: { status: "text" },
      }),
      physicalIndexId: after?.physicalIndexId ?? physicalIndexIdFor("products"),
      generation: after?.activeGeneration ?? 2,
      existingSchema: true,
    });
    expect((await index.search("sqlite")).map((hit) => hit.id)).toEqual(["p1"]);
    expect((await doctorIndex(adapter, definition)).healthy).toBe(true);
  });

  test("failed linked rebuild keeps the old generation and is not healthy", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p1",
        "sqlite",
        "database",
        "active",
      ]),
    );
    const definition = linkedDefinition();
    await createIndex({ adapter, definition });
    const before = await readRegistry(adapter, "products");
    const names = physicalNames(
      definition,
      before?.physicalIndexId ?? physicalIndexIdFor("products"),
      before?.activeGeneration ?? 1,
    );
    await adapter.execute(sql("DROP TABLE products"));
    await expect(rebuildIndex({ adapter, definition })).rejects.toThrow(SearchError);
    const after = await readRegistry(adapter, "products");
    expect(after?.health).toBe("pending");
    expect(after?.activeGeneration).toBe(before?.activeGeneration);
    const docs = await adapter.query<{ name: string }>(
      sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [names.docs]),
    );
    const fts = await adapter.query<{ name: string }>(
      sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [names.fts]),
    );
    expect(docs.length).toBe(1);
    expect(fts.length).toBe(1);
    const report = await doctorIndex(adapter, definition);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((finding) => finding.code === "registry-pending")).toBe(true);
  });

  test("partial physical objects are never healthy", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { title: { weight: 1 } },
    });
    await createIndex({ adapter, definition });
    const names = physicalNames(definition, physicalIndexIdFor("notes"), 1);
    await adapter.execute(sql(`DROP TABLE "${names.fts}"`));
    const report = await doctorIndex(adapter, definition);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((finding) => finding.code === "missing-physical")).toBe(true);
    await dropIndex({ adapter, definition });
  });

  test("createIndex heals a pending registry without dropping an intact generation", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p1",
        "sqlite",
        "database",
        "active",
      ]),
    );
    const definition = linkedDefinition();
    await createIndex({ adapter, definition });
    const before = await readRegistry(adapter, "products");
    expect(before).not.toBeNull();
    if (!before) {
      throw new Error("expected registry row");
    }
    const names = physicalNames(definition, before.physicalIndexId, before.activeGeneration);
    await adapter.execute(
      sql(
        `INSERT INTO ${quoteIdent(names.docs)} (${quoteIdent("source_id")}, ${quoteIdent("name_source")}, ${quoteIdent("description_source")}, ${quoteIdent("status")}) VALUES (?, ?, ?, ?)`,
        ["canary", "canaryterm", "kept", "active"],
      ),
    );
    const inserted = await adapter.query<{ doc_id: number }>(
      sql(
        `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} = ?`,
        ["canary"],
      ),
    );
    await adapter.execute(
      sql(
        `INSERT INTO ${quoteIdent(names.fts)} (${quoteIdent("rowid")}, ${quoteIdent("name")}, ${quoteIdent("description")}) VALUES (?, ?, ?)`,
        [inserted[0]?.doc_id, "canaryterm", "kept"],
      ),
    );
    await writePendingRegistry(adapter, { ...before, updatedAt: Date.now() });

    await createIndex({ adapter, definition });
    const after = await readRegistry(adapter, "products");
    expect(after?.health).toBe("healthy");
    expect(after?.activeGeneration).toBe(before.activeGeneration);

    const index = await createManualFts5Proof({
      adapter,
      definition: defineIndex({
        name: "products",
        mode: "manual",
        source: { table: "products", primaryKey: { field: "id", type: "string" } },
        searchable: { name: { weight: 5 }, description: { weight: 1 } },
        filterable: { status: "text" },
      }),
      physicalIndexId: before.physicalIndexId,
      generation: before.activeGeneration,
      existingSchema: true,
    });
    expect((await index.search("canaryterm")).map((hit) => hit.id)).toEqual(["canary"]);
  });
});
