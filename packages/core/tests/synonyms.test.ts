import { describe, expect, test } from "bun:test";
import {
  DEFAULT_APPLICATION_LIMITS,
  expandTextQueryWithSynonyms,
  normalizeSynonymKey,
  SearchError,
} from "../src/index.ts";

describe("query-time synonyms", () => {
  test("expands one level and keeps the original term first", () => {
    const expanded = expandTextQueryWithSynonyms(
      { kind: "term", value: "iphone" },
      { iphone: ["ايفون", "آيفون"] },
      { limits: DEFAULT_APPLICATION_LIMITS },
    );
    expect(expanded).toEqual({
      kind: "or",
      children: [
        { kind: "term", value: "iphone" },
        { kind: "term", value: "ايفون" },
        { kind: "term", value: "آيفون" },
      ],
    });
  });

  test("does not recursively walk bidirectional synonym cycles", () => {
    const expanded = expandTextQueryWithSynonyms(
      { kind: "term", value: "iphone" },
      {
        iphone: ["ايفون"],
        ايفون: ["iphone", "айфон"],
      },
      { limits: DEFAULT_APPLICATION_LIMITS },
    );
    expect(expanded).toEqual({
      kind: "or",
      children: [
        { kind: "term", value: "iphone" },
        { kind: "term", value: "ايفون" },
      ],
    });
  });

  test("matches synonym keys case-insensitively after NFC normalization", () => {
    expect(normalizeSynonymKey("iPhone")).toBe(normalizeSynonymKey("iphone"));
    const expanded = expandTextQueryWithSynonyms(
      { kind: "term", value: "iPhone" },
      { IPHONE: ["handset"] },
      { limits: DEFAULT_APPLICATION_LIMITS },
    );
    expect(expanded).toEqual({
      kind: "or",
      children: [
        { kind: "term", value: "iPhone" },
        { kind: "term", value: "handset" },
      ],
    });
  });

  test("rejects expansion that exceeds maxSynonymExpansion", () => {
    expect(() =>
      expandTextQueryWithSynonyms(
        {
          kind: "and",
          children: [
            { kind: "term", value: "alpha" },
            { kind: "term", value: "beta" },
          ],
        },
        { alpha: ["a1", "a2"], beta: ["b1", "b2"] },
        { limits: { ...DEFAULT_APPLICATION_LIMITS, maxSynonymExpansion: 3 } },
      ),
    ).toThrow(SearchError);
  });

  test("does not rewrite phrase nodes", () => {
    const phrase = { kind: "phrase" as const, terms: ["iphone", "pro"] };
    expect(
      expandTextQueryWithSynonyms(
        phrase,
        { iphone: ["ايفون"] },
        { limits: DEFAULT_APPLICATION_LIMITS },
      ),
    ).toEqual(phrase);
  });
});
