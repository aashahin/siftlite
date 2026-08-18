import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createClient } from "@libsql/client";
import { drizzle as bunDrizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as libsqlDrizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { physicalIndexIdFor } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { libsqlAdapter, wrapLibsqlClient } from "@siftlite/libsql";
import { createIndex, readRegistry, searchFts5Index, writePendingRegistry } from "@siftlite/fts5";
import { defineDrizzleIndex, drizzleSearch } from "../src/index.ts";
import { products } from "./schema.ts";

const definitionInput = {
  id: products.id,
  searchable: {
    name: { weight: 5 },
    description: { weight: 1 },
  },
  filterable: {
    status: products.status,
  },
} as const;

async function createProductsTable(exec: (sql: string) => Promise<void> | void): Promise<void> {
  await exec(`CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    price INTEGER,
    created_at INTEGER
  )`);
}

describe("@siftlite/drizzle trigger ownership", () => {
  test("Bun Drizzle writes and raw SQL both stay synchronized", async () => {
    const sqlite = new Database(":memory:");
    const adapter = bunSqliteAdapter(sqlite);
    const db = bunDrizzle(sqlite, { schema: { products } });
    await createProductsTable((sql) => {
      sqlite.run(sql);
    });
    const index = defineDrizzleIndex(products, definitionInput);
    await createIndex({ adapter, definition: index.definition });

    await db.insert(products).values({
      id: "p1",
      name: "drizzle phone",
      description: "orm write",
      status: "active",
    });
    sqlite.run("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
      "p2",
      "raw sql phone",
      "trigger write",
      "active",
    ]);

    const search = drizzleSearch(db, index, adapter);
    const ormHits = await search.search("drizzle", { hydrate: true });
    expect(ormHits.hits.map((hit) => hit.id)).toEqual(["p1"]);
    expect(ormHits.hits[0]?.document?.["name"]).toBe("drizzle phone");

    const rawHits = await search.search("raw", { hydrate: true });
    expect(rawHits.hits.map((hit) => hit.id)).toEqual(["p2"]);

    await db.update(products).set({ name: "renamed phone" }).where(eq(products.id, "p1"));
    expect((await search.search("drizzle")).hits).toEqual([]);
    expect((await search.search("renamed")).hits.map((hit) => hit.id)).toEqual(["p1"]);

    sqlite.run("DELETE FROM products WHERE id = ?", ["p2"]);
    expect((await search.search("raw")).hits).toEqual([]);
  });

  test("libSQL Drizzle writes and raw SQL both stay synchronized", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    const db = libsqlDrizzle(client, { schema: { products } });
    await createProductsTable(async (sql) => {
      await client.execute(sql);
    });
    const index = defineDrizzleIndex(products, definitionInput);
    await createIndex({ adapter, definition: index.definition });

    await db.insert(products).values({
      id: "l1",
      name: "libsql phone",
      description: "orm",
      status: "active",
    });
    await client.execute({
      sql: "INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)",
      args: ["l2", "direct phone", "raw", "active"],
    });

    const orm = await searchFts5Index(
      {
        adapter,
        definition: index.definition,
        physicalIndexId: physicalIndexIdFor("products"),
        generation: 1,
      },
      "libsql",
    );
    expect(orm.hits.map((hit) => hit.id)).toEqual(["l1"]);
    const raw = await searchFts5Index(
      {
        adapter,
        definition: index.definition,
        physicalIndexId: physicalIndexIdFor("products"),
        generation: 1,
      },
      "direct",
    );
    expect(raw.hits.map((hit) => hit.id)).toEqual(["l2"]);
  });

  test("search fails closed while the registry is pending", async () => {
    const sqlite = new Database(":memory:");
    const adapter = bunSqliteAdapter(sqlite);
    const db = bunDrizzle(sqlite, { schema: { products } });
    await createProductsTable((sql) => {
      sqlite.run(sql);
    });
    const index = defineDrizzleIndex(products, definitionInput);
    await createIndex({ adapter, definition: index.definition });
    const row = await readRegistry(adapter, index.definition.name);
    expect(row).not.toBeNull();
    if (!row) {
      throw new Error("expected registry row");
    }
    await writePendingRegistry(adapter, { ...row, updatedAt: Date.now() });
    await expect(drizzleSearch(db, index, adapter).search("drizzle")).rejects.toMatchObject({
      code: "SEARCH_MAINTENANCE_FAILED",
    });
  });

  // D1 + Drizzle trigger ownership is impractical in this bun:test file
  // (Drizzle cannot run inside workerd here). D1 evidence for P10-07 lives in
  // packages/d1/workers-tests/conformance.workers.ts (`d1_orm_products`).
});
