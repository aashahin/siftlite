import { describe, expect, test } from "bun:test";
import {
  booleanIntegerCodec,
  encodeFieldValue,
  finiteRealCodec,
  safeIntegerCodec,
  SearchError,
  textCodec,
  timestampIntegerCodec,
} from "../src/index.ts";

describe("canonical codecs", () => {
  test("text preserves exact strings", () => {
    expect(textCodec.encode("000123")).toBe("000123");
    expect(textCodec.decode("000123")).toBe("000123");
  });

  test("safe-integer and finite-real reject illegal numbers", () => {
    expect(safeIntegerCodec.encode(42)).toBe(42);
    expect(finiteRealCodec.encode(10.5)).toBe(10.5);
    expect(finiteRealCodec.encode(10)).toBe(10);
    expect(() => safeIntegerCodec.encode(10.5)).toThrow(SearchError);
    expect(() => safeIntegerCodec.encode(Number.NaN)).toThrow(SearchError);
    expect(() => finiteRealCodec.encode(Number.POSITIVE_INFINITY)).toThrow(SearchError);
    expect(() => finiteRealCodec.encode(1n as unknown as number)).toThrow(SearchError);
  });

  test("boolean stores as integer 0/1", () => {
    expect(booleanIntegerCodec.encode(true)).toBe(1);
    expect(booleanIntegerCodec.encode(false)).toBe(0);
    expect(booleanIntegerCodec.decode(1)).toBe(true);
    expect(booleanIntegerCodec.decode(0)).toBe(false);
    expect(booleanIntegerCodec.decode("1")).toBe(true);
    expect(booleanIntegerCodec.decode("0")).toBe(false);
    expect(() => booleanIntegerCodec.decode(2)).toThrow(SearchError);
  });

  test("integer and timestamp codecs accept exact decimal strings from adapters", () => {
    expect(safeIntegerCodec.decode("42")).toBe(42);
    expect(safeIntegerCodec.decode(42n as unknown as 42)).toBe(42);
    expect(timestampIntegerCodec("unix-milliseconds").decode("1700000000000")).toBe(
      1_700_000_000_000,
    );
    expect(finiteRealCodec.decode("10.5")).toBe(10.5);
    expect(() => safeIntegerCodec.decode("42.0")).toThrow(SearchError);
  });

  test("timestamp codec requires an explicit unit and rejects Date", () => {
    const ms = timestampIntegerCodec("unix-milliseconds");
    expect(ms.encode(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(() => ms.encode(new Date() as unknown as number)).toThrow(SearchError);
    expect(() => ms.encode(1.5)).toThrow(SearchError);
  });

  test("rejects objects, arrays, and null comparison values", () => {
    expect(() => textCodec.encode({} as string)).toThrow(SearchError);
    expect(() => encodeFieldValue({ storageKind: "text" }, [1, 2])).toThrow(SearchError);
    expect(() => encodeFieldValue({ storageKind: "text" }, null)).toThrow(SearchError);
  });
});
