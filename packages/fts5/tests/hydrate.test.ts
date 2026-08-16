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
});
