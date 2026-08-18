import { describe, expect, test } from "bun:test";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { physicalIndexIdFor, SearchError } from "@siftlite/core";
import { compileIndexLifecycleSql, REGISTRY_SQL_COLUMNS } from "@siftlite/fts5";
import {
  defineDrizzleIndex,
  generateDrizzleSearchSql,
  mapDrizzleColumnToFieldType,
} from "../src/index.ts";
import { products } from "./schema.ts";

describe("@siftlite/drizzle definition mapping", () => {
  test("maps Drizzle metadata into canonical SiftLite schema", () => {
    const index = defineDrizzleIndex(products, {
      id: products.id,
      normalization: ["arabic-basic"],
      searchable: {
        name: { weight: 5 },
        description: { weight: 1 },
      },
      filterable: {
        status: products.status,
        price: products.price,
      },
      sortable: {
        price: products.price,
        createdAt: products.createdAt,
      },
      facets: [products.status],
    });
    expect(index.definition.source?.table).toBe("products");
    expect(index.definition.source?.primaryKey).toEqual({ field: "id", type: "string" });
    expect(index.definition.searchableOrder).toEqual(["name", "description"]);
    expect(index.definition.filterable["status"]?.storageKind).toBe("text");
    expect(index.definition.filterable["price"]?.storageKind).toBe("safe-integer");
    expect(index.definition.sortable["created_at"]?.storageKind).toBe("timestamp-integer");
    expect(index.definition.sortable["created_at"]?.timestampUnit).toBe("unix-milliseconds");
    expect(index.definition.facets).toEqual(["status"]);
    expect(index.definition.normalization).toEqual(["arabic-basic"]);
  });

  test("rejects blob, bigint, and JSON columns", () => {
    const messy = sqliteTable("messy", {
      id: text("id").primaryKey(),
      name: text("name"),
      payload: blob("payload"),
      huge: blob("huge", { mode: "bigint" }),
      json: blob("json", { mode: "json" }),
    });
    expect(() => mapDrizzleColumnToFieldType(messy.payload)).toThrow(SearchError);
    expect(() => mapDrizzleColumnToFieldType(messy.huge)).toThrow(SearchError);
    expect(() => mapDrizzleColumnToFieldType(messy.json)).toThrow(SearchError);
    expect(() =>
      defineDrizzleIndex(messy, {
        id: messy.payload as never,
        searchable: { name: { weight: 1 } },
      }),
    ).toThrow(SearchError);
  });

  test("rejects non-text searchable columns", () => {
    expect(() =>
      defineDrizzleIndex(products, {
        id: products.id,
        searchable: { price: { weight: 1 } },
      }),
    ).toThrow(SearchError);
  });

  test("generates deterministic companion SQL", () => {
    const index = defineDrizzleIndex(products, {
      id: products.id,
      searchable: { name: { weight: 1 } },
      filterable: { status: products.status },
    });
    const left = generateDrizzleSearchSql(index);
    const right = generateDrizzleSearchSql(index);
    expect(left.sql).toBe(right.sql);
    expect(left.logicalDefinitionHash).toBe(right.logicalDefinitionHash);
    expect(left.physicalSchemaHash).toBe(right.physicalSchemaHash);
    expect(left.sql).toContain("CREATE TABLE");
    expect(left.sql).toContain("USING fts5");
    expect(left.sql).toContain("CREATE TRIGGER");
  });

  test("companion SQL forwards compileIndexLifecycleSql including registry", () => {
    const index = defineDrizzleIndex(products, {
      id: products.id,
      searchable: { name: { weight: 1 } },
      filterable: { status: products.status },
    });
    const migration = generateDrizzleSearchSql(index);
    const lifecycle = compileIndexLifecycleSql(
      index.definition,
      physicalIndexIdFor(index.definition.name),
      1,
    );
    expect(migration.statements).toEqual(lifecycle);
    expect(migration.sql).toContain("__sift_registry");
    for (const column of REGISTRY_SQL_COLUMNS) {
      expect(migration.sql).toContain(column);
    }
  });

  test("integer IDs map to safe-integer source IDs", () => {
    const numeric = sqliteTable("items", {
      id: integer("id").primaryKey(),
      title: text("title"),
    });
    const index = defineDrizzleIndex(numeric, {
      id: numeric.id,
      searchable: { title: { weight: 1 } },
    });
    expect(index.definition.source?.primaryKey.type).toBe("safe-integer");
  });
});
