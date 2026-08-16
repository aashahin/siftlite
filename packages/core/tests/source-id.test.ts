import { describe, expect, test } from "bun:test";
import {
  assertSourceId,
  isSourceId,
  SearchError,
  sourceIdKind,
  sourceIdsEqual,
} from "../src/index.ts";

describe("SourceId", () => {
  test("preserves string and numeric identity separately", () => {
    expect(assertSourceId("000123")).toBe("000123");
    expect(assertSourceId("123")).toBe("123");
    expect(assertSourceId(123)).toBe(123);
    expect(sourceIdsEqual("123", 123)).toBe(false);
    expect(sourceIdsEqual("000123", "123")).toBe(false);
    expect(sourceIdsEqual(123, 123)).toBe(true);
    expect(sourceIdKind("123")).toBe("string");
    expect(sourceIdKind(123)).toBe("safe-integer");
  });

  test("accepts safe-integer boundaries", () => {
    expect(assertSourceId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(assertSourceId(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
    expect(assertSourceId(0)).toBe(0);
    expect(assertSourceId(-1)).toBe(-1);
  });

  test("rejects bigint, unsafe integers, NaN, and Infinity", () => {
    expect(() => assertSourceId(1n)).toThrow(SearchError);
    expect(() => assertSourceId(Number.MAX_SAFE_INTEGER + 1)).toThrow(SearchError);
    expect(() => assertSourceId(Number.NaN)).toThrow(SearchError);
    expect(() => assertSourceId(Number.POSITIVE_INFINITY)).toThrow(SearchError);
    expect(() => assertSourceId(Number.NEGATIVE_INFINITY)).toThrow(SearchError);
    expect(() => assertSourceId({ id: 1 })).toThrow(SearchError);
    expect(isSourceId(1n)).toBe(false);
    expect(isSourceId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});
