import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { defineIndex, hashLogicalDefinition, physicalIndexIdFor, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  checkIndex,
  createIndex,
  createManualFts5Proof,
  doctorIndex,
  dropIndex,
  readRegistry,
  rebuildIndex,
  syncRuntimeDefinition,
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

    const names = (await import("../src/names.ts")).physicalNames(
      definition,
      physicalIndexIdFor("notes"),
      1,
    );
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

  test("partial physical objects are never healthy", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { title: { weight: 1 } },
    });
    await createIndex({ adapter, definition });
    const names = (await import("../src/names.ts")).physicalNames(
      definition,
      physicalIndexIdFor("notes"),
      1,
    );
    await adapter.execute(sql(`DROP TABLE "${names.fts}"`));
    const report = await doctorIndex(adapter, definition);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((finding) => finding.code === "missing-physical")).toBe(true);
    await dropIndex({ adapter, definition });
  });
});
