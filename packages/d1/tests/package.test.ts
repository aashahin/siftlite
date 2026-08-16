import { describe, expect, test } from "bun:test";
import {
  D1_DEFAULT_SEARCH_POLICY,
  D1_SQL_LIMITS,
  SIFTLITE_D1_PACKAGE,
  assertD1BindValue,
  d1RuntimeCapabilities,
} from "../src/index.ts";
import { SearchError } from "@siftlite/core";

describe("@siftlite/d1", () => {
  test("exports package identity and documented D1 limits", () => {
    expect(SIFTLITE_D1_PACKAGE.name).toBe("@siftlite/d1");
    expect(SIFTLITE_D1_PACKAGE.dependsOn).toBe("@siftlite/core");
    expect(D1_SQL_LIMITS.maxBindParameters).toBe(100);
    expect(D1_SQL_LIMITS.maxFunctionArguments).toBe(32);
    expect(D1_SQL_LIMITS.maxStatementBytes).toBe(100_000);
    expect(D1_SQL_LIMITS.maxLikePatternBytes).toBe(50);
    expect(D1_SQL_LIMITS.maxQueryDurationMs).toBe(30_000);
  });

  test("marks D1 cost-sensitive and disables typo fallback by default", () => {
    const runtime = d1RuntimeCapabilities("database");
    expect(runtime.costSensitive).toBe(true);
    expect(runtime.consistency.sessionAware).toBe(false);
    expect(runtime.consistency.readReplicaEligible).toBe(true);
    expect(d1RuntimeCapabilities("session").consistency.sequentialSessionConsistency).toBe(true);
    expect(D1_DEFAULT_SEARCH_POLICY.typoFallback).toBe("disabled-on-cost-sensitive-runtimes");
  });

  test("rejects bigint and unsafe integers before D1 bind", () => {
    expect(() => assertD1BindValue(1n)).toThrow(SearchError);
    expect(() => assertD1BindValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(SearchError);
    expect(() => assertD1BindValue(Number.NaN)).toThrow(SearchError);
    expect(assertD1BindValue(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(assertD1BindValue(12.5)).toBe(12.5);
  });
});
