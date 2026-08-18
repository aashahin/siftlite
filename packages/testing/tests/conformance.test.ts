import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { bunSqliteAdapter } from "@siftlite/bun";
import type { SqlAdapter } from "@siftlite/core";
import {
  runArabicNormalizationCorpus,
  runFts5SearchConformance,
  runSqlAdapterConformance,
} from "../src/index.ts";

describe("shared conformance", () => {
  test("SQL adapter and FTS5 suites pass on Bun", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await runSqlAdapterConformance(adapter, { rejectUnsafeIntegers: true });
    await runFts5SearchConformance(adapter);
    await runArabicNormalizationCorpus(adapter);
    expect(adapter.id).toBe("bun-sqlite");
  });

  test("SQL adapter suite can run twice on the same database", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await runSqlAdapterConformance(adapter, { rejectUnsafeIntegers: true });
    await runSqlAdapterConformance(adapter, { rejectUnsafeIntegers: true });
    expect(adapter.id).toBe("bun-sqlite");
  });

  test("does not pass when advertised transactions throw", async () => {
    const base = bunSqliteAdapter(new Database(":memory:"));
    const adapter = wrapAdapter(base, {
      transaction: async () => {
        throw new Error("tx-probe-failed");
      },
    });
    await expect(runSqlAdapterConformance(adapter)).rejects.toThrow("tx-probe-failed");
  });

  test("does not pass when a follow-up query after transaction() throws", async () => {
    const base = bunSqliteAdapter(new Database(":memory:"));
    let emptyTxFinished = false;
    const adapter = wrapAdapter(base, {
      query: async (statement) => {
        if (emptyTxFinished) {
          throw new Error("follow-up-query-failed");
        }
        return base.query(statement);
      },
      transaction: async (fn) => {
        if (!base.transaction) {
          throw new Error("missing transaction");
        }
        const result = await base.transaction(fn);
        emptyTxFinished = true;
        return result;
      },
    });
    await expect(runSqlAdapterConformance(adapter)).rejects.toThrow("follow-up-query-failed");
  });

  test("skips transaction checks when the capability is false", async () => {
    const base = bunSqliteAdapter(new Database(":memory:"));
    const adapter = wrapAdapter(base, {
      runtimeCapabilities: { ...base.runtimeCapabilities, transactions: false },
      transaction: async () => {
        throw new Error("should-not-run");
      },
    });
    await runSqlAdapterConformance(adapter);
    expect(adapter.runtimeCapabilities.transactions).toBe(false);
  });
});

function wrapAdapter(base: SqlAdapter, overrides: Partial<SqlAdapter>): SqlAdapter {
  return {
    id: base.id,
    dialect: base.dialect,
    runtimeCapabilities: overrides.runtimeCapabilities ?? base.runtimeCapabilities,
    query: overrides.query ?? ((statement) => base.query(statement)),
    execute: overrides.execute ?? ((statement) => base.execute(statement)),
    ...(base.batch || overrides.batch
      ? {
          batch: (statements) => {
            const run = overrides.batch ?? base.batch;
            if (!run) {
              throw new Error("missing batch");
            }
            return run.call(base, statements);
          },
        }
      : {}),
    ...(base.transaction || overrides.transaction
      ? {
          transaction: <T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T> => {
            const run = overrides.transaction ?? base.transaction;
            if (!run) {
              throw new Error("missing transaction");
            }
            return run(fn);
          },
        }
      : {}),
  };
}
