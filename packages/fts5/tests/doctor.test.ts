import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { defineIndex, physicalIndexIdFor, quoteIdent, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  checkIndex,
  createIndex,
  doctorIndex,
  physicalNames,
  readRegistry,
  writePendingRegistry,
} from "../src/index.ts";

function linkedDefinition() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 1 } },
    filterable: { status: "text" },
  });
}

describe("doctor", () => {
  test("pending registry is not healthy and checkIndex is not ok", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?)", ["p1", "sqlite", "active"]),
    );
    const definition = linkedDefinition();
    await createIndex({ adapter, definition });
    const row = await readRegistry(adapter, "products");
    expect(row).not.toBeNull();
    if (!row) {
      throw new Error("expected registry row");
    }
    await writePendingRegistry(adapter, { ...row, updatedAt: Date.now() });
    const report = await doctorIndex(adapter, definition);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((finding) => finding.code === "registry-pending")).toBe(true);
    const check = await checkIndex(adapter, definition);
    expect(check.ok).toBe(false);
  });

  test("deep doctor reports count mismatch that fast mode skips", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?)", ["p1", "sqlite", "active"]),
    );
    const definition = linkedDefinition();
    await createIndex({ adapter, definition });
    const row = await readRegistry(adapter, "products");
    const names = physicalNames(
      definition,
      row?.physicalIndexId ?? physicalIndexIdFor("products"),
      row?.activeGeneration ?? 1,
    );
    await adapter.execute(sql(`DELETE FROM ${quoteIdent(names.fts)} WHERE ${quoteIdent("rowid")} = 1`));
    const fast = await doctorIndex(adapter, definition);
    expect(fast.healthy).toBe(true);
    const deep = await doctorIndex(adapter, definition, { level: "deep" });
    expect(deep.healthy).toBe(false);
    expect(deep.findings.some((finding) => finding.code === "count-mismatch")).toBe(true);
  });

  test("ensureRegistry rejects drifted registry columns", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(sql(`CREATE TABLE ${quoteIdent("__sift_registry")} (index_name TEXT PRIMARY KEY)`));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { title: { weight: 1 } },
    });
    try {
      await createIndex({ adapter, definition });
      throw new Error("expected registry drift to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: string }).code).toBe("SEARCH_MAINTENANCE_FAILED");
    }
  });
});
