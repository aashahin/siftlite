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
    await expect(
      adapter.execute(sql("INSERT INTO items (id) VALUES (?)", [1n])),
    ).rejects.toBeInstanceOf(SearchError);
  });

  test("batch commits on success and rolls back a mid-batch failure", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(sql("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"));

    const committed = await adapter.batch?.([
      sql("INSERT INTO items (id, name) VALUES (?, ?)", [1, "one"]),
      sql("INSERT INTO items (id, name) VALUES (?, ?)", [2, "two"]),
    ]);
    expect(committed).toHaveLength(2);
    const afterCommit = await adapter.query<{ id: number }>(
      sql("SELECT id FROM items ORDER BY id"),
    );
    expect(afterCommit.map((row) => row.id)).toEqual([1, 2]);

    await expect(
      adapter.batch?.([
        sql("INSERT INTO items (id, name) VALUES (?, ?)", [3, "three"]),
        sql("INSERT INTO items (id, name) VALUES (?, ?)", [1, "duplicate"]),
      ]),
    ).rejects.toBeInstanceOf(SearchError);

    const afterFailure = await adapter.query<{ id: number }>(
      sql("SELECT id FROM items ORDER BY id"),
    );
    expect(afterFailure.map((row) => row.id)).toEqual([1, 2]);
  });

  test("batch inside an open transaction does not issue a nested BEGIN", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(sql("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"));

    await adapter.transaction?.(async (tx) => {
      await tx.batch?.([
        sql("INSERT INTO items (id, name) VALUES (?, ?)", [1, "one"]),
        sql("INSERT INTO items (id, name) VALUES (?, ?)", [2, "two"]),
      ]);
    });

    const rows = await adapter.query<{ id: number }>(sql("SELECT id FROM items ORDER BY id"));
    expect(rows.map((row) => row.id)).toEqual([1, 2]);

    await expect(
      adapter.transaction?.(async (tx) => {
        await tx.batch?.([
          sql("INSERT INTO items (id, name) VALUES (?, ?)", [3, "three"]),
          sql("INSERT INTO items (id, name) VALUES (?, ?)", [1, "duplicate"]),
        ]);
      }),
    ).rejects.toBeInstanceOf(SearchError);

    const afterFailure = await adapter.query<{ id: number }>(
      sql("SELECT id FROM items ORDER BY id"),
    );
    expect(afterFailure.map((row) => row.id)).toEqual([1, 2]);
  });
});
