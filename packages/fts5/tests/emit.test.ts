import { describe, expect, test } from "bun:test";
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
});
