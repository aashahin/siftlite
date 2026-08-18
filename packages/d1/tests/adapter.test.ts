import { describe, expect, test } from "bun:test";
import { SearchError, sql } from "@siftlite/core";
import { d1Adapter } from "../src/index.ts";
import type { D1DatabaseLike, D1PreparedLike, D1ResultLike } from "../src/index.ts";

describe("d1 adapter", () => {
  test("query/execute/batch throw when success is false", async () => {
    const unsuccessful: D1ResultLike = {
      success: false,
      results: [],
      error: "SELECT * FROM hidden failed",
    };
    const adapter = d1Adapter(
      mockD1({
        all: async () => unsuccessful,
        run: async () => unsuccessful,
        batch: async () => [unsuccessful],
      }),
    );

    await expect(adapter.query(sql("SELECT 1"))).rejects.toMatchObject({
      code: "SEARCH_ADAPTER_ERROR",
      message: "D1 adapter error",
      details: { reason: "d1-unsuccessful" },
    });
    await expect(adapter.execute(sql("UPDATE t SET x = 1"))).rejects.toMatchObject({
      code: "SEARCH_ADAPTER_ERROR",
      details: { reason: "d1-unsuccessful" },
    });
    await expect(adapter.batch?.([sql("INSERT INTO t VALUES (1)")])).rejects.toMatchObject({
      code: "SEARCH_ADAPTER_ERROR",
      details: { reason: "d1-unsuccessful" },
    });
  });

  test("mixed batch rejects when any statement has success false", async () => {
    const mixed = d1Adapter(
      mockD1({
        batch: async () => [
          { success: true, meta: { changes: 1 } },
          { success: false, results: [], error: "constraint" },
        ],
      }),
    );
    await expect(
      mixed.batch?.([sql("INSERT INTO t VALUES (1)"), sql("INSERT INTO t VALUES (1)")]),
    ).rejects.toMatchObject({
      code: "SEARCH_ADAPTER_ERROR",
      details: { reason: "d1-unsuccessful" },
    });
  });

  test("unsuccessful D1 result does not copy driver SQL into the message", async () => {
    const adapter = d1Adapter(
      mockD1({
        all: async () => ({
          success: false,
          results: [],
          error: "SELECT * FROM hidden failed",
        }),
      }),
    );
    try {
      await adapter.query(sql("SELECT 1"));
      throw new Error("expected unsuccessful D1 query to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).message).not.toContain("SELECT * FROM hidden");
    }
  });

  test("does not treat empty results as success when success is false", async () => {
    const adapter = d1Adapter(
      mockD1({
        all: async () => ({ success: false, results: [] }),
      }),
    );
    await expect(adapter.query(sql("SELECT 1"))).rejects.toBeInstanceOf(SearchError);
  });

  test("returns empty results when success is true", async () => {
    const adapter = d1Adapter(
      mockD1({
        all: async () => ({ success: true, results: [] }),
      }),
    );
    await expect(adapter.query(sql("SELECT 1"))).resolves.toEqual([]);
  });

  test("wraps driver errors without copying the driver message", async () => {
    const adapter = d1Adapter(
      mockD1({
        all: async () => {
          throw new Error('near "SELECT * FROM secrets": syntax error');
        },
      }),
    );
    try {
      await adapter.query(sql("SELECT * FROM secrets"));
      throw new Error("expected adapter to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      const wrapped = error as SearchError;
      expect(wrapped.code).toBe("SEARCH_ADAPTER_ERROR");
      expect(wrapped.message).toBe("D1 adapter error");
      expect(wrapped.message).not.toContain("SELECT * FROM secrets");
      expect(wrapped.cause).toBeInstanceOf(Error);
    }
  });

  test("rejects unsafe integer binds", async () => {
    const adapter = d1Adapter(mockD1({}));
    await expect(
      adapter.query(sql("SELECT ?", [Number.MAX_SAFE_INTEGER + 1])),
    ).rejects.toMatchObject({
      code: "SEARCH_VALUE_INVALID",
      details: { reason: "unsafe-integer" },
    });
  });
});

function mockD1(impl: {
  all?: () => Promise<D1ResultLike>;
  run?: () => Promise<D1ResultLike>;
  batch?: () => Promise<readonly D1ResultLike[]>;
}): D1DatabaseLike {
  const prepared: D1PreparedLike = {
    bind(..._values: unknown[]) {
      return prepared;
    },
    all: <T = Record<string, unknown>>() =>
      (impl.all?.() ?? Promise.resolve({ success: true, results: [] })) as Promise<D1ResultLike<T>>,
    run: <T = Record<string, unknown>>() =>
      (impl.run?.() ?? Promise.resolve({ success: true, meta: { changes: 0 } })) as Promise<
        D1ResultLike<T>
      >,
  };
  return {
    prepare() {
      return prepared;
    },
    batch: <T = Record<string, unknown>>() =>
      (impl.batch?.() ?? Promise.resolve([])) as Promise<readonly D1ResultLike<T>[]>,
  };
}
