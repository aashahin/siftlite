import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  and,
  bindScope,
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  eq,
  physicalIndexIdFor,
  quoteIdent,
  SearchError,
  sql,
  type SearchHooks,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  createFts5Engine,
  physicalNames,
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

  test("malformed request scope fails closed as SearchError", async () => {
    const { handle } = await seededHandle();
    const scoped = handle.scope({ status: "active" });
    await expect(
      scoped.search("sqlite", { scope: { kind: "bound-scope" } as never }),
    ).rejects.toBeInstanceOf(SearchError);
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

  test("manual create + upsert writes to the registered generation", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      source: { table: "notes", primaryKey: { field: "id", type: "string" } },
      searchable: { title: { weight: 1 } },
    });
    const engine = createFts5Engine({ adapter });
    const handle = engine.index(definition);
    await handle.create();
    await handle.upsert([{ id: "n1", searchable: { title: "portable search" } }]);

    const row = await readRegistry(adapter, "notes");
    expect(row?.physicalIndexId).toBe(physicalIndexIdFor("notes"));
    expect(row?.physicalIndexId).not.toBe("proof");
    expect(row?.activeGeneration).toBe(1);
    const names = physicalNames(
      definition,
      row?.physicalIndexId ?? physicalIndexIdFor("notes"),
      row?.activeGeneration ?? 1,
    );
    const stored = await adapter.query<{ source_id: string }>(
      sql(`SELECT ${quoteIdent("source_id")} AS source_id FROM ${quoteIdent(names.docs)}`),
    );
    expect(stored.map((item) => item.source_id)).toEqual(["n1"]);
    const proofTables = await adapter.query<{ name: string }>(
      sql("SELECT name FROM sqlite_master WHERE name LIKE ?", ["%_proof_%"]),
    );
    expect(proofTables).toEqual([]);

    const result = await handle.search("portable");
    expect(result.hits.map((hit) => hit.id)).toEqual(["n1"]);
    await handle.delete("n1");
    expect((await handle.search("portable")).hits).toEqual([]);
  });

  test("linked upsert and delete are unsupported", async () => {
    const { handle } = await seededHandle();
    await expect(
      handle.upsert([{ id: "p9", searchable: { name: "widget" } }]),
    ).rejects.toMatchObject({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
    });
    await expect(handle.delete("p1")).rejects.toMatchObject({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
    });
  });

  test("invalid application limits are rejected before the engine is stored", () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    expect(() =>
      createFts5Engine({
        adapter,
        limits: { ...DEFAULT_APPLICATION_LIMITS, defaultLimit: -1 },
      }),
    ).toThrow(SearchError);
    try {
      createFts5Engine({
        adapter,
        limits: { ...DEFAULT_APPLICATION_LIMITS, defaultLimit: 200, maxLimit: 100 },
      });
      throw new Error("expected invalid limits to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "SEARCH_CONFIG_INVALID" });
    }
  });
});
