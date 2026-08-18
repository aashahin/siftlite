import { describe, expect, test } from "bun:test";
import {
  codePointTrigrams,
  damerauLevenshtein,
  maxEditsForToken,
  validateFuzzyCandidatePolicy,
  DEFAULT_FUZZY_POLICY,
  SearchError,
} from "../src/index.ts";

describe("Phase 12 fuzzy primitives", () => {
  test("builds Unicode code-point trigrams and skips short tokens", () => {
    expect(codePointTrigrams("iphone")).toEqual(["iph", "pho", "hon", "one"]);
    expect(codePointTrigrams("ip")).toEqual([]);
    expect(codePointTrigrams("𐍈ab")).toEqual(["𐍈ab"]);
  });

  test("Damerau-Levenshtein counts a transposition as one edit", () => {
    expect(damerauLevenshtein("iphone", "iphone")).toBe(0);
    expect(damerauLevenshtein("iphoen", "iphone")).toBe(1);
    expect(maxEditsForToken(4)).toBe(0);
    expect(maxEditsForToken(6)).toBe(1);
    expect(maxEditsForToken(10)).toBe(2);
  });

  test("rejects an invalid fuzzy policy", () => {
    expect(() =>
      validateFuzzyCandidatePolicy({ ...DEFAULT_FUZZY_POLICY, minTokenCodepoints: 2 }),
    ).toThrow(SearchError);
  });
});
