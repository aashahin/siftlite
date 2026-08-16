import { describe, expect, test } from "bun:test";
import {
  attachHydratedDocuments,
  chunkIdsForHydration,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  reserveBinds,
  SearchError,
} from "../src/index.ts";

describe("hydration chunking", () => {
  test("chunks identifiers using remaining bind budget", () => {
    const budget = createStatementBudget(
      { maxBindParameters: 5 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 100 },
    );
    expect(chunkIdsForHydration(["a", "b", "c", "d", "e", "f"], budget)).toEqual([
      ["a", "b", "c", "d", "e"],
      ["f"],
    ]);
  });

  test("application maxInValues still caps a large remaining budget", () => {
    const budget = createStatementBudget(
      { maxBindParameters: 10_000 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 2 },
    );
    expect(chunkIdsForHydration([1, 2, 3], budget)).toEqual([[1, 2], [3]]);
  });

  test("throws when the remaining IN-list budget is zero", () => {
    const exhausted = createStatementBudget(
      { maxBindParameters: 2 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 100 },
    );
    reserveBinds(exhausted, 2, "search");
    expect(() => chunkIdsForHydration(["a"], exhausted)).toThrow(SearchError);

    const zeroCeiling = createStatementBudget(
      { maxBindParameters: 10 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 0 },
    );
    expect(() => chunkIdsForHydration(["a", "b"], zeroCeiling)).toThrow(SearchError);
    expect(chunkIdsForHydration([], zeroCeiling)).toEqual([]);
  });

  test("unproven runtime limits fall back to the application ceiling", () => {
    const budget = createStatementBudget({}, { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 3 });
    expect(chunkIdsForHydration(["a", "b", "c", "d"], budget)).toEqual([["a", "b", "c"], ["d"]]);
  });

  test("restores rank order and preserves source-ID types", () => {
    const documents = new Map<string | number, { title: string }>([
      [20, { title: "second" }],
      ["0001", { title: "first" }],
    ]);
    expect(attachHydratedDocuments(["0001", 20], documents)).toEqual([
      { title: "first" },
      { title: "second" },
    ]);
  });
});
