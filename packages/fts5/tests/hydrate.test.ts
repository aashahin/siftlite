import { describe, expect, test } from "bun:test";
import { defineIndex, SearchError } from "@siftlite/core";
import { restoreSourceId } from "../src/index.ts";

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
