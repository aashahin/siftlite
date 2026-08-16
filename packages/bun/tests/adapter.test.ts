import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SearchError, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "../src/index.ts";

describe("bun sqlite adapter", () => {
  test("executes parameterized queries and transactions", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(sql("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"));
    await adapter.transaction?.(async (tx) => {
      await tx.execute(sql("INSERT INTO items (name) VALUES (?)", ["alpha"]));
    });
    const rows = await adapter.query<{ name: string }>(
      sql("SELECT name FROM items WHERE name = ?", ["alpha"]),
    );
    expect(rows).toEqual([{ name: "alpha" }]);
  });

  test("rejects bigint binds", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(sql("CREATE TABLE items (id INTEGER)"));
    expect(adapter.execute(sql("INSERT INTO items (id) VALUES (?)", [1n]))).rejects.toBeInstanceOf(
      SearchError,
    );
  });
});
