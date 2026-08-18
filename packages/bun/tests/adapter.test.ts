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

  test("rejects unsafe integer binds", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await expect(
      adapter.query(sql("SELECT ?", [Number.MAX_SAFE_INTEGER + 1])),
    ).rejects.toMatchObject({
      code: "SEARCH_VALUE_INVALID",
      details: { reason: "unsafe-integer" },
    });
    await expect(
      adapter.execute(sql("SELECT ?", [Number.MIN_SAFE_INTEGER - 1])),
    ).rejects.toBeInstanceOf(SearchError);
  });

  test("wraps driver errors without copying the driver message", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    const invalidSql = "THIS IS NOT VALID SQL";
    try {
      await adapter.query(sql(invalidSql));
      throw new Error("expected adapter to reject invalid SQL");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      const wrapped = error as SearchError;
      expect(wrapped.code).toBe("SEARCH_ADAPTER_ERROR");
      expect(wrapped.message).toBe("bun:sqlite adapter error");
      expect(wrapped.message).not.toContain(invalidSql);
      expect(wrapped.cause).toBeDefined();
    }
  });

  test("transaction rollback errors do not hide the original failure", async () => {
    const raw = new Database(":memory:");
    const originalExec = raw.exec.bind(raw);
    const db = new Proxy(raw, {
      get(target, prop, receiver) {
        if (prop === "exec") {
          return (query: string) => {
            if (query === "ROLLBACK") {
              throw new Error("rollback-failed");
            }
            return originalExec(query);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(sql("CREATE TABLE items (id INTEGER PRIMARY KEY)"));
    try {
      await adapter.transaction?.(async (tx) => {
        await tx.execute(sql("INSERT INTO items (id) VALUES (?)", [1]));
        throw new Error("original-failure");
      });
      throw new Error("expected transaction to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      const wrapped = error as SearchError;
      expect(wrapped.code).toBe("SEARCH_ADAPTER_ERROR");
      expect(wrapped.message).toBe("bun:sqlite adapter error");
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe("original-failure");
    }
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
