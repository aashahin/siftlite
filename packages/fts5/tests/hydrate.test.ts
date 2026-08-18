import { describe, expect, test } from "bun:test";
import { defineIndex, SearchError, type SqlAdapter } from "@siftlite/core";
import { createProjectionHydrator, restoreSourceId } from "../src/index.ts";

function numericItems() {
  return defineIndex({
    name: "items",
    mode: "manual",
    source: { table: "items", primaryKey: { field: "id", type: "safe-integer" } },
    searchable: { title: { weight: 1 } },
  });
}

function textualNotes() {
  return defineIndex({
    name: "notes",
    mode: "manual",
    source: { table: "notes", primaryKey: { field: "id", type: "string" } },
    searchable: { body: { weight: 1 } },
  });
}

describe("restoreSourceId", () => {
  test("string PK stringifies values and preserves exact text", () => {
    const textual = textualNotes();
    expect(restoreSourceId(textual, "000123")).toBe("000123");
    expect(restoreSourceId(textual, 5)).toBe("5");
    expect(restoreSourceId(textual, 0)).toBe("0");
    expect(restoreSourceId(textual, "0")).toBe("0");
  });

  test("integer PK accepts zero and exact decimals, rejects bigint and unsafe integers", () => {
    const numeric = numericItems();
    expect(restoreSourceId(numeric, 0)).toBe(0);
    expect(restoreSourceId(numeric, "0")).toBe(0);
    expect(() => restoreSourceId(numeric, 1n)).toThrow(SearchError);
    expect(() => restoreSourceId(numeric, Number.MAX_SAFE_INTEGER + 1)).toThrow(SearchError);
    expect(() => restoreSourceId(numeric, "9007199254740993")).toThrow(SearchError);
  });

  test("rejects missing source ids for both PK kinds", () => {
    expect(() => restoreSourceId(numericItems(), undefined)).toThrow(SearchError);
    expect(() => restoreSourceId(numericItems(), null)).toThrow(SearchError);
    expect(() => restoreSourceId(textualNotes(), undefined)).toThrow(SearchError);
  });
});

describe("toDocument codec decode", () => {
  test("decodes boolean-integer projection storage to true/false", async () => {
    const definition = defineIndex({
      name: "items",
      mode: "manual",
      source: { table: "items", primaryKey: { field: "id", type: "string" } },
      searchable: { title: { weight: 1 } },
      filterable: { published: "boolean", views: "integer" },
    });
    const hydrator = createProjectionHydrator({
      adapter: mockQueryAdapter([
        { source_id: "a", title_source: "hello", published: 1, views: 3 },
        { source_id: "b", title_source: "world", published: 0, views: 0 },
        { source_id: "c", title_source: "none", published: null, views: null },
      ]),
      definition,
      physicalIndexId: "proof",
      generation: 1,
    });
    const documents = await hydrator.hydrate(["a", "b", "c"]);
    expect(documents.get("a")).toEqual({
      id: "a",
      title: "hello",
      published: true,
      views: 3,
    });
    expect(documents.get("b")).toEqual({
      id: "b",
      title: "world",
      published: false,
      views: 0,
    });
    expect(documents.get("c")).toEqual({
      id: "c",
      title: "none",
      published: null,
      views: null,
    });
  });
});

function mockQueryAdapter(rows: readonly Record<string, unknown>[]): SqlAdapter {
  return {
    id: "test",
    dialect: "sqlite",
    runtimeCapabilities: {
      id: "test",
      dialect: "sqlite",
      limits: { maxBindParameters: 100 },
      consistency: {
        transactionReadYourWrites: true,
        postCommitReadYourWrites: true,
        sessionAware: false,
        sequentialSessionConsistency: false,
        readReplicaEligible: false,
      },
      transactions: false,
      batch: false,
      cancellation: false,
    },
    async query() {
      return rows as never;
    },
    async execute() {
      return { rowsAffected: 0 };
    },
  };
}
