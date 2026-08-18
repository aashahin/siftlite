import { describe, expect, test } from "bun:test";
import { SearchError, sql } from "@siftlite/core";
import {
  nodeSqliteAdapter,
  type BetterSqliteDatabaseLike,
  type BetterSqliteStatementLike,
} from "../src/index.ts";

function memoryDb(): BetterSqliteDatabaseLike {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  const statement = (text: string): BetterSqliteStatementLike => ({
    all(...params: unknown[]) {
      if (/SELECT \?/.test(text)) {
        return [{ value: params[0] }];
      }
      return tables.get("items") ?? [];
    },
    run(...params: unknown[]) {
      if (/CREATE TABLE/.test(text)) {
        tables.set("items", []);
        return { changes: 0 };
      }
      if (/INSERT/.test(text)) {
        const rows = tables.get("items") ?? [];
        rows.push({ name: params[0] });
        tables.set("items", rows);
        return { changes: 1 };
      }
      return { changes: 0 };
    },
  });
  return {
    prepare(text) {
      return statement(text);
    },
    exec() {
      return undefined;
    },
  };
}

describe("@siftlite/node", () => {
  test("round-trips parameterized inserts through the better-sqlite3 surface", async () => {
    const adapter = nodeSqliteAdapter(memoryDb());
    await adapter.execute(sql("CREATE TABLE items (name TEXT)"));
    await adapter.execute(sql("INSERT INTO items (name) VALUES (?)", ["alpha"]));
    const rows = await adapter.query<{ name: string }>(sql("SELECT name FROM items"));
    expect(rows).toEqual([{ name: "alpha" }]);
  });

  test("rejects bigint binds", async () => {
    const adapter = nodeSqliteAdapter(memoryDb());
    await expect(adapter.query(sql("SELECT ?", [1n]))).rejects.toBeInstanceOf(SearchError);
  });
});
