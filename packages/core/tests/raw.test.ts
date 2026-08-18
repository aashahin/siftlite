import { describe, expect, test } from "bun:test";
import { isUnsafeFts5Query, SearchError, unsafeFts5Query } from "../src/index.ts";

describe("unsafe FTS5 query brand", () => {
  test("wraps a non-empty query and rejects empty or NUL values", () => {
    const raw = unsafeFts5Query('title:"sqlite" AND body:fts5');
    expect(raw).toEqual({
      kind: "unsafe-backend-query",
      backend: "fts5",
      value: 'title:"sqlite" AND body:fts5',
    });
    expect(isUnsafeFts5Query(raw)).toBe(true);
    expect(isUnsafeFts5Query({ kind: "unsafe-backend-query", backend: "fts5", value: "x" })).toBe(
      true,
    );
    expect(isUnsafeFts5Query({ kind: "unsafe-backend-query", backend: "other", value: "x" })).toBe(
      false,
    );
    expect(isUnsafeFts5Query("title:sqlite")).toBe(false);
    expect(() => unsafeFts5Query("")).toThrow(SearchError);
    expect(() => unsafeFts5Query("match\u0000all")).toThrow(SearchError);
    expect(isUnsafeFts5Query({ kind: "unsafe-backend-query", backend: "fts5", value: "" })).toBe(
      false,
    );
    expect(
      isUnsafeFts5Query({ kind: "unsafe-backend-query", backend: "fts5", value: "match\u0000all" }),
    ).toBe(false);
  });
});
