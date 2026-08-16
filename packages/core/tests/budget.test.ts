import { describe, expect, test } from "bun:test";
import {
  assertInListFits,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  effectiveMaxInValues,
  interpretLimit,
  isUnprovenLimit,
  remainingBindBudget,
  reserveBinds,
  SearchError,
} from "../src/index.ts";

describe("runtime SQL limits and budgets", () => {
  test("undefined limits are unproven, not unlimited", () => {
    expect(isUnprovenLimit(undefined)).toBe(true);
    expect(interpretLimit(undefined)).toBe("unproven");
    expect(interpretLimit(100)).toBe(100);
    const budget = createStatementBudget({}, DEFAULT_APPLICATION_LIMITS);
    expect(remainingBindBudget(budget)).toBe("unproven");
    reserveBinds(budget, 10_000, "in-list");
    expect(effectiveMaxInValues(budget)).toBe(DEFAULT_APPLICATION_LIMITS.maxInValues);
  });

  test("reserves search, scope, pagination, and IN-list binds before execution", () => {
    const budget = createStatementBudget(
      { maxBindParameters: 10 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 100 },
    );
    reserveBinds(budget, 1, "search");
    reserveBinds(budget, 1, "scope");
    reserveBinds(budget, 2, "pagination");
    expect(effectiveMaxInValues(budget)).toBe(6);
    expect(() => assertInListFits(budget, 7)).toThrow(SearchError);
    assertInListFits(budget, 6);
    reserveBinds(budget, 6, "in-list");
    expect(() => reserveBinds(budget, 1, "filter")).toThrow(SearchError);
  });

  test("application maxInValues still caps a large remaining bind budget", () => {
    const budget = createStatementBudget(
      { maxBindParameters: 10_000 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 8 },
    );
    reserveBinds(budget, 3, "search");
    expect(effectiveMaxInValues(budget)).toBe(8);
  });
});
