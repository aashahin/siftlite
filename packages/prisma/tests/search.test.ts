import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createClient } from "@libsql/client";
import { defineIndex, physicalIndexIdFor, SearchError, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { libsqlAdapter, wrapLibsqlClient } from "@siftlite/libsql";
import {
  compileIndexLifecycleSql,
  createIndex,
  readRegistry,
  REGISTRY_SQL_COLUMNS,
  writePendingRegistry,
} from "@siftlite/fts5";
import {
  createPrismaHydrator,
  createPrismaSearch,
  generatePrismaSearchSql,
  searchExtension,
  SIFTLITE_PRISMA_SUPPORT,
  type PrismaClientLike,
  type PrismaFindManyArgs,
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

function createPrismaLikeLibsql(client: ReturnType<typeof createClient>): PrismaClientLike {
  return {
    product: {
      async findMany(args: { where: Record<string, { in: readonly string[] }> }) {
        const ids = args.where["id"]?.in ?? [];
        if (ids.length === 0) {
          return [];
        }
        const placeholders = ids.map(() => "?").join(", ");
        const result = await client.execute({
          sql: `SELECT id, name, description, status FROM products WHERE id IN (${placeholders})`,
          args: [...ids],
        });
        return result.rows as unknown as ProductRow[];
      },
      async create(data: ProductRow) {
        await client.execute({
          sql: "INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)",
          args: [data.id, data.name, data.description, data.status],
        });
        return data;
      },
    },
  };
}

describe("@siftlite/prisma", () => {
  test("Prisma 6 support does not require an FTS model or query hooks", () => {
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

  test("companion SQL forwards compileIndexLifecycleSql including registry", () => {
    const definition = productsIndex();
    const migration = generatePrismaSearchSql(definition);
    const lifecycle = compileIndexLifecycleSql(definition, physicalIndexIdFor(definition.name), 1);
    expect(migration.statements).toEqual(lifecycle);
    expect(migration.sql).toContain("__sift_registry");
    for (const column of REGISTRY_SQL_COLUMNS) {
      expect(migration.sql).toContain(column);
    }
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
  });

  test("libSQL Prisma-like CRUD and raw SQL both stay synchronized through triggers", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    await client.execute(
      "CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)",
    );
    const index = productsIndex();
    await createIndex({ adapter, definition: index });
    const prisma = createPrismaLikeLibsql(client);
    const product = prisma["product"] as {
      create(data: ProductRow): Promise<ProductRow>;
    };
    await product.create({
      id: "l1",
      name: "prisma libsql phone",
      description: "orm write",
      status: "active",
    });
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "l2",
        "raw libsql phone",
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
    expect(orm.hits.map((hit) => hit.id)).toEqual(["l1"]);
    expect(orm.hits[0]?.document?.name).toBe("prisma libsql phone");
    const raw = await service.search("raw", { hydrate: true });
    expect(raw.hits.map((hit) => hit.id)).toEqual(["l2"]);
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
    const extension = searchExtension({
      prisma,
      adapter,
      models: { product: index },
    });
    const result = await extension.model["product"]?.search("extension", {
      hydrate: true,
    });
    expect(result?.hits.map((hit) => hit.id)).toEqual(["p3"]);
  });

  test("Prisma hydrator restores numeric zero source ids", async () => {
    const definition = defineIndex({
      name: "items",
      mode: "manual",
      source: { table: "items", primaryKey: { field: "id", type: "safe-integer" } },
      searchable: { title: { weight: 1 } },
    });
    const prisma: PrismaClientLike = {
      item: {
        findMany: async (args: PrismaFindManyArgs) => {
          expect(Object.keys(args.where)).toEqual(["id"]);
          return [{ id: 0, title: "zero" }];
        },
      },
    };
    const hydrator = createPrismaHydrator({
      prisma,
      model: "item",
      definition,
      adapter: bunSqliteAdapter(new Database(":memory:")),
    });
    const documents = await hydrator.hydrate([0]);
    expect(documents.get(0)?.["title"]).toBe("zero");
  });

  test("Prisma hydrator reads prismaIdField pid while SQL primary key stays id", async () => {
    const definition = defineIndex({
      name: "items",
      mode: "manual",
      source: { table: "items", primaryKey: { field: "id", type: "string" } },
      searchable: { title: { weight: 1 } },
    });
    expect(definition.source?.primaryKey.field).toBe("id");
    const prisma: PrismaClientLike = {
      item: {
        findMany: async (args: PrismaFindManyArgs) => {
          expect(args.where["pid"]?.in).toEqual(["p1"]);
          expect(args.where["id"]).toBeUndefined();
          return [{ pid: "p1", title: "mapped" }];
        },
      },
    };
    const hydrator = createPrismaHydrator({
      prisma,
      model: "item",
      definition,
      adapter: bunSqliteAdapter(new Database(":memory:")),
      prismaIdField: "pid",
    });
    const documents = await hydrator.hydrate(["p1"]);
    expect(documents.get("p1")?.["title"]).toBe("mapped");
    expect(documents.get("p1")?.["pid"]).toBe("p1");
  });

  test("createPrismaSearch hydrates via prismaIdField", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    db.run("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)");
    const index = productsIndex();
    await createIndex({ adapter, definition: index });
    db.run("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
      "p4",
      "mapped phone",
      "pid field",
      "active",
    ]);
    const prisma: PrismaClientLike = {
      product: {
        async findMany(args: { where: Record<string, { in: readonly string[] }> }) {
          const ids = args.where["pid"]?.in ?? [];
          expect(args.where["id"]).toBeUndefined();
          return ids.map((pid) => ({
            pid,
            name: "mapped phone",
            description: "pid field",
            status: "active",
          }));
        },
      },
    };
    const service = createPrismaSearch({
      prisma,
      adapter,
      model: "product",
      index,
      prismaIdField: "pid",
    });
    const result = await service.search("mapped", { hydrate: true });
    expect(result.hits.map((hit) => hit.id)).toEqual(["p4"]);
    expect(result.hits[0]?.document?.["pid"]).toBe("p4");
  });

  test("searchExtension forwards prismaIdFields into hydration", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    db.run("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)");
    const index = productsIndex();
    await createIndex({ adapter, definition: index });
    db.run("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
      "p5",
      "extension mapped",
      "pid field",
      "active",
    ]);
    const prisma: PrismaClientLike = {
      product: {
        async findMany(args: { where: Record<string, { in: readonly string[] }> }) {
          expect(args.where["pid"]?.in).toEqual(["p5"]);
          return [{ pid: "p5", name: "extension mapped", description: "pid field", status: "active" }];
        },
      },
    };
    const extension = searchExtension({
      prisma,
      adapter,
      models: { product: index },
      prismaIdFields: { product: "pid" },
    });
    const result = await extension.model["product"]?.search("extension", { hydrate: true });
    expect(result?.hits.map((hit) => hit.id)).toEqual(["p5"]);
    expect(result?.hits[0]?.document?.["pid"]).toBe("p5");
  });

  test("search fails closed while the registry is pending", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    db.run("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)");
    const index = productsIndex();
    const service = createPrismaSearch<ProductRow>({
      prisma: createPrismaLike(db),
      adapter,
      model: "product",
      index,
    });
    await createIndex({ adapter, definition: index });
    const row = await readRegistry(adapter, "products");
    expect(row).not.toBeNull();
    if (!row) {
      throw new Error("expected registry row");
    }
    await writePendingRegistry(adapter, { ...row, updatedAt: Date.now() });
    await expect(service.search("prisma")).rejects.toMatchObject({
      code: "SEARCH_MAINTENANCE_FAILED",
    });
  });

  test("Prisma hydrator fails when the definition has no source primary key", () => {
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { body: { weight: 1 } },
    });
    expect(() =>
      createPrismaHydrator({
        prisma: { note: { findMany: async () => [] } },
        model: "note",
        definition,
        adapter: bunSqliteAdapter(new Database(":memory:")),
      }),
    ).toThrow(SearchError);
  });
});
