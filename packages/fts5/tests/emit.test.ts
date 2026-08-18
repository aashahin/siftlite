import { describe, expect, test } from "bun:test";
import { SearchError } from "@siftlite/core";
import { emitFts5Match, escapeFts5Literal } from "../src/index.ts";

describe("FTS5 emitter", () => {
  test("escapes quotes and never interpolates operators from term text", () => {
    expect(escapeFts5Literal('foo"bar')).toBe('"foo""bar"');
    expect(emitFts5Match({ kind: "term", value: "AND" })).toBe('"AND"');
    expect(emitFts5Match({ kind: "term", value: "foo:bar" })).toBe('"foo:bar"');
    expect(emitFts5Match({ kind: "term", value: "sqlite", prefix: true })).toBe('"sqlite"*');
    expect(emitFts5Match({ kind: "phrase", terms: ["iphone", "pro"] })).toBe('"iphone pro"');
    expect(
      emitFts5Match({
        kind: "and",
        children: [
          { kind: "term", value: "sqlite" },
          { kind: "term", value: "AND" },
        ],
      }),
    ).toBe('("sqlite" AND "AND")');
  });

  test("emits FTS5 column filters from AST field selectors", () => {
    const searchable = ["title"];
    expect(emitFts5Match({ kind: "term", value: "sqlite", field: "title" }, searchable)).toBe(
      'title:"sqlite"',
    );
    expect(
      emitFts5Match({ kind: "term", value: "sqlite", field: "title", prefix: true }, searchable),
    ).toBe('title:"sqlite"*');
    expect(
      emitFts5Match({ kind: "phrase", terms: ["iphone", "pro"], field: "title" }, searchable),
    ).toBe('title:"iphone pro"');
  });

  test("fielded MATCH requires a searchable allowlist", () => {
    expect(() => emitFts5Match({ kind: "term", value: "sqlite", field: "title" })).toThrow(
      SearchError,
    );
    expect(() =>
      emitFts5Match({ kind: "term", value: "sqlite", field: "status" }, ["title"]),
    ).toThrow(SearchError);
  });

  test("rejects field selectors that are not FTS5 identifiers", () => {
    expect(() => emitFts5Match({ kind: "term", value: "sqlite", field: "title;drop" })).toThrow(
      SearchError,
    );
    expect(() => emitFts5Match({ kind: "term", value: "sqlite", field: "foo-bar" })).toThrow(
      SearchError,
    );
    expect(() => emitFts5Match({ kind: "term", value: "sqlite", field: 'title"' })).toThrow(
      SearchError,
    );
    expect(() => emitFts5Match({ kind: "phrase", terms: ["sqlite"], field: "1title" })).toThrow(
      SearchError,
    );
  });
});
