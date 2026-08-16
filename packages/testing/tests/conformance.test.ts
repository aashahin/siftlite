import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  runArabicNormalizationCorpus,
  runFts5SearchConformance,
  runSqlAdapterConformance,
} from "../src/index.ts";

describe("shared conformance", () => {
  test("SQL adapter and FTS5 suites pass on Bun", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await runSqlAdapterConformance(adapter);
    await runFts5SearchConformance(adapter);
    await runArabicNormalizationCorpus(adapter);
    expect(adapter.id).toBe("bun-sqlite");
  });

  test("SQL adapter suite can run twice on the same database", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await runSqlAdapterConformance(adapter);
    await runSqlAdapterConformance(adapter);
    expect(adapter.id).toBe("bun-sqlite");
  });
});
