import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { defineIndex, physicalIndexIdFor, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { createIndex } from "@siftlite/fts5";
import {
  createPrismaSearch,
  generatePrismaSearchSql,
  searchExtension,
  SIFTLITE_PRISMA_PACKAGE,
  SIFTLITE_PRISMA_SUPPORT,
  type PrismaClientLike,
} from "../src/index.ts";

interface ProductRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
}

function productsIndex() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 5 }, description: { weight: 1 } },
    filterable: { status: "text" },
  });
}

function createPrismaLike(db: Database): PrismaClientLike {
  return {
    product: {
      async findMany(args: { where: Record<string, { in: readonly string[] }> }) {
        const ids = args.where["id"]?.in ?? [];
        if (ids.length === 0) {
          return [];
        }
        const placeholders = ids.map(() => "?").join(", ");
        return db
          .query(`SELECT id, name, description, status FROM products WHERE id IN (${placeholders})`)
          .all(...ids) as ProductRow[];
      },
      async create(data: ProductRow) {
        db.run("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
          data.id,
          data.name,
          data.description,
          data.status,
        ]);
        return data;
      },
    },
  };
}

describe("@siftlite/prisma", () => {
  test("exports package identity and Prisma 6 support without FTS models", () => {
    expect(SIFTLITE_PRISMA_PACKAGE.name).toBe("@siftlite/prisma");
    expect(SIFTLITE_PRISMA_SUPPORT.major).toBe(6);
    expect(SIFTLITE_PRISMA_SUPPORT.requiresFtsModel).toBe(false);
    expect(SIFTLITE_PRISMA_SUPPORT.requiresQueryHooks).toBe(false);
  });

  test("companion SQL is deterministic and does not rewrite Prisma schema", () => {
    const left = generatePrismaSearchSql(productsIndex());
    const right = generatePrismaSearchSql(productsIndex());
    expect(left.sql).toBe(right.sql);
    expect(left.logicalDefinitionHash).toBe(right.logicalDefinitionHash);
    expect(left.sql).toContain("CREATE TRIGGER");
    expect(left.sql).not.toContain("model Product");
  });

  test("Prisma-like CRUD and raw SQL both stay synchronized through triggers", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    db.run("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)");
    const index = productsIndex();
    await createIndex({ adapter, definition: index });
    const prisma = createPrismaLike(db);
    const product = prisma["product"] as {
      create(data: ProductRow): Promise<ProductRow>;
    };
    await product.create({
      id: "p1",
      name: "prisma phone",
      description: "orm write",
      status: "active",
    });
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p2",
        "raw phone",
        "sql write",
        "active",
      ]),
    );

    const service = createPrismaSearch<ProductRow>({
      prisma,
      adapter,
      model: "product",
      index,
    });
    const orm = await service.search("prisma", { hydrate: true });
    expect(orm.hits.map((hit) => hit.id)).toEqual(["p1"]);
    expect(orm.hits[0]?.document?.["name"]).toBe("prisma phone");
    const raw = await service.search("raw", { hydrate: true });
    expect(raw.hits.map((hit) => hit.id)).toEqual(["p2"]);
    expect(physicalIndexIdFor("products").length).toBeGreaterThan(0);
  });

  test("Client Extension wrapper is ergonomic and not a write hook", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    db.run("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)");
    const index = productsIndex();
    await createIndex({ adapter, definition: index });
    db.run("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
      "p3",
      "extension phone",
      "wrap",
      "active",
    ]);
    const prisma = createPrismaLike(db);
    const extension = searchExtension({ adapter, models: { product: index } });
    expect(extension.name).toBe("siftlite-search");
    const result = await extension.model["product"]?.search.call({ client: prisma }, "extension", {
      hydrate: true,
    });
    expect(result?.hits.map((hit) => hit.id)).toEqual(["p3"]);
  });
});
