import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  and,
  bindScope,
  defineIndex,
  eq,
  SearchError,
  sql,
  type SearchHooks,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  createFts5Engine,
  unsafeFts5Query,
  writePendingRegistry,
  readRegistry,
} from "../src/index.ts";

function catalogDefinition() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 5 } },
    filterable: { status: "text" },
  });
}

async function seededHandle() {
  const adapter = bunSqliteAdapter(new Database(":memory:"));
  await adapter.execute(sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"));
  await adapter.execute(
    sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)", [
      "p1",
      "sqlite",
      "active",
      "p2",
      "sqlite",
      "archived",
      "p3",
      "other",
      "active",
    ]),
  );
  const engine = createFts5Engine({ adapter });
  const handle = engine.index(catalogDefinition());
  await handle.create();
  return { adapter, handle };
}

describe("createFts5Engine", () => {
  test("creates an index and searches through the handle", async () => {
    const { handle } = await seededHandle();
    const result = await handle.search("sqlite");
    expect(result.hits.map((hit) => hit.id).sort()).toEqual(["p1", "p2"]);
  });

  test("handle scope stays applied even when a user filter tries to widen", async () => {
    const { handle } = await seededHandle();
    const scoped = handle.scope({ status: "active" });
    const widened = await scoped.search("sqlite", { filter: eq("status", "archived") });
    expect(widened.hits).toEqual([]);

    const active = await scoped.search("sqlite");
    expect(active.hits.map((hit) => hit.id)).toEqual(["p1"]);
  });

  test("request.scope cannot drop handle scope", async () => {
    const { handle } = await seededHandle();
    const scoped = handle.scope({ status: "active" });
    const replaced = await scoped.search("sqlite", { scope: bindScope({ status: "archived" }) });
    expect(replaced.hits).toEqual([]);
  });

  test("searchRaw on the handle uses unsafe FTS5 grammar", async () => {
    const { handle } = await seededHandle();
    const raw = await handle.searchRaw(unsafeFts5Query('name:"sqlite"'));
    expect(raw.hits.map((hit) => hit.id).sort()).toEqual(["p1", "p2"]);

    const ordinary = await handle.search('name:"sqlite"');
    expect(ordinary.hits.map((hit) => hit.id)).toEqual([]);
  });

  test("search fails closed while the registry is pending", async () => {
    const { adapter, handle } = await seededHandle();
    const row = await readRegistry(adapter, "products");
    expect(row).not.toBeNull();
    if (!row) {
      throw new Error("expected registry row");
    }
    await writePendingRegistry(adapter, { ...row, updatedAt: Date.now() });
    await expect(handle.search("sqlite")).rejects.toMatchObject({
      code: "SEARCH_MAINTENANCE_FAILED",
    });
  });

  test("search throws SEARCH_INDEX_NOT_FOUND before create", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const engine = createFts5Engine({ adapter });
    const handle = engine.index(catalogDefinition());
    await expect(handle.search("sqlite")).rejects.toBeInstanceOf(SearchError);
    await expect(handle.search("sqlite")).rejects.toMatchObject({ code: "SEARCH_INDEX_NOT_FOUND" });
  });

  test("search hook counts filter AST nodes and omits query text", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"),
    );
    await adapter.execute(
      sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?)", ["p1", "sqlite", "active"]),
    );
    const events: Parameters<NonNullable<SearchHooks["onSearch"]>>[0][] = [];
    const engine = createFts5Engine({
      adapter,
      hooks: {
        onSearch(event) {
          events.push(event);
        },
      },
    });
    const handle = engine.index(catalogDefinition());
    await handle.create();
    await handle.search("sqlite", {
      filter: and(eq("status", "active"), eq("status", "active")),
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.filterCount).toBe(3);
    expect(events[0]?.facetCount).toBe(0);
    expect(events[0]?.resultCount).toBe(1);
    expect(events[0]).not.toHaveProperty("query");
    expect(JSON.stringify(events[0])).not.toContain("sqlite");
  });
});
