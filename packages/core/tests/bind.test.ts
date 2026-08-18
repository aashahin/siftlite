import { describe, expect, test } from "bun:test";
import { assertBindValue, assertBindValues, SearchError } from "../src/index.ts";

describe("portable bind values", () => {
  test("accepts null, string, finite number, boolean, and Uint8Array", () => {
    expect(assertBindValue(null)).toBe(null);
    expect(assertBindValue("active")).toBe("active");
    expect(assertBindValue(0)).toBe(0);
    expect(assertBindValue(-0)).toBe(-0);
    expect(assertBindValue(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(assertBindValue(12.5)).toBe(12.5);
    expect(assertBindValue(true)).toBe(true);
    expect(assertBindValue(false)).toBe(false);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(assertBindValue(bytes)).toBe(bytes);
    expect(assertBindValues([null, "x", 1, false, bytes])).toEqual([null, "x", 1, false, bytes]);
  });

  test("rejects undefined, objects, arrays, symbols, functions, bigint, and non-finite numbers", () => {
    expect(() => assertBindValue(undefined)).toThrow(SearchError);
    expect(() => assertBindValue({ ok: true })).toThrow(SearchError);
    expect(() => assertBindValue(new Date())).toThrow(SearchError);
    expect(() => assertBindValue([1, 2])).toThrow(SearchError);
    expect(() => assertBindValue(Symbol("bind"))).toThrow(SearchError);
    expect(() => assertBindValue(() => null)).toThrow(SearchError);
    expect(() => assertBindValue(1n)).toThrow(SearchError);
    expect(() => assertBindValue(Number.NaN)).toThrow(SearchError);
    expect(() => assertBindValue(Number.POSITIVE_INFINITY)).toThrow(SearchError);
    expect(() => assertBindValue(Number.NEGATIVE_INFINITY)).toThrow(SearchError);
    expect(() => assertBindValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(SearchError);
    expect(() => assertBindValue(Number.MIN_SAFE_INTEGER - 1)).toThrow(SearchError);
    expect(() => assertBindValue(new ArrayBuffer(4))).toThrow(SearchError);
    expect(() => assertBindValues(["ok", undefined])).toThrow(SearchError);
    try {
      assertBindValue(Number.MAX_SAFE_INTEGER + 1);
      throw new Error("expected unsafe integer to throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: "SEARCH_VALUE_INVALID",
        details: { reason: "unsafe-integer" },
      });
    }
  });
});
