import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { createDrizzleHydrator, defineDrizzleIndex } from "../src/index.ts";

describe("@siftlite/drizzle hydration", () => {
  test("restores numeric zero source ids from Drizzle rows", async () => {
    const items = sqliteTable("items", {
      id: integer("id").primaryKey(),
      title: text("title"),
    });
    const sqlite = new Database(":memory:");
    sqlite.run("CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT)");
    sqlite.run("INSERT INTO items (id, title) VALUES (0, 'zero')");
    const db = drizzle(sqlite, { schema: { items } });
    const index = defineDrizzleIndex(items, {
      id: items.id,
      searchable: { title: { weight: 1 } },
    });
    const documents = await createDrizzleHydrator({
      db,
      index,
      adapter: bunSqliteAdapter(sqlite),
    }).hydrate([0]);
    expect(documents.get(0)?.title).toBe("zero");
  });
});
