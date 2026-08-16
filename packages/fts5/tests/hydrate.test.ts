import { describe, expect, test } from "bun:test";
import { defineIndex, SearchError } from "@siftlite/core";
import { restoreSourceId } from "../src/index.ts";

describe("restoreSourceId", () => {
  test("keeps numeric zero and rejects missing ids", () => {
    const numeric = defineIndex({
      name: "items",
      mode: "manual",
      source: { table: "items", primaryKey: { field: "id", type: "safe-integer" } },
      searchable: { title: { weight: 1 } },
    });
    expect(restoreSourceId(numeric, 0)).toBe(0);
    expect(restoreSourceId(numeric, "0")).toBe(0);
    expect(() => restoreSourceId(numeric, undefined)).toThrow(SearchError);
    expect(() => restoreSourceId(numeric, null)).toThrow(SearchError);

    const textual = defineIndex({
      name: "notes",
      mode: "manual",
      source: { table: "notes", primaryKey: { field: "id", type: "string" } },
      searchable: { body: { weight: 1 } },
    });
    expect(restoreSourceId(textual, "0")).toBe("0");
    expect(() => restoreSourceId(textual, undefined)).toThrow(SearchError);
  });

  test("string PK always stringifies and preserves exact text", () => {
    const textual = defineIndex({
      name: "notes",
      mode: "manual",
      source: { table: "notes", primaryKey: { field: "id", type: "string" } },
      searchable: { body: { weight: 1 } },
    });
    expect(restoreSourceId(textual, 5)).toBe("5");
    expect(restoreSourceId(textual, "000123")).toBe("000123");
    expect(restoreSourceId(textual, 0)).toBe("0");
  });

  test("integer PK accepts zero and rejects bigint and unsafe integers", () => {
    const numeric = defineIndex({
      name: "items",
      mode: "manual",
      source: { table: "items", primaryKey: { field: "id", type: "safe-integer" } },
      searchable: { title: { weight: 1 } },
    });
    expect(restoreSourceId(numeric, 0)).toBe(0);
    expect(() => restoreSourceId(numeric, 1n)).toThrow(SearchError);
    expect(() => restoreSourceId(numeric, 9007199254740993)).toThrow(SearchError);
    expect(() => restoreSourceId(numeric, "9007199254740993")).toThrow(SearchError);
  });
});
