import { SearchError, sql, type SqlAdapter } from "@siftlite/core";

/**
 * Shared adapter conformance used by Bun and Workers-runtime suites.
 * Implementations must use a real SQL engine, not a mock.
 */
export async function runSqlAdapterConformance(
  adapter: SqlAdapter,
  options: { readonly rejectUnsafeIntegers?: boolean } = {},
): Promise<void> {
  await adapter.execute(sql("CREATE TABLE conformance_ids (id INTEGER PRIMARY KEY, label TEXT)"));
  await adapter.execute(sql("INSERT INTO conformance_ids (id, label) VALUES (?, ?)", [1, "one"]));
  const rows = await adapter.query<{ id: number; label: string }>(
    sql("SELECT id, label FROM conformance_ids WHERE id = ?", [1]),
  );
  if (rows[0]?.id !== 1 || rows[0]?.label !== "one") {
    throw new SearchError({
      code: "SEARCH_ADAPTER_ERROR",
      message: "adapter conformance failed to round-trip a parameterized row",
      details: { reason: "round-trip" },
    });
  }

  await expectRejects(() => adapter.query(sql("SELECT ?", [1n])), "bigint");
  if (options.rejectUnsafeIntegers === true) {
    await expectRejects(
      () => adapter.query(sql("SELECT ?", [Number.MAX_SAFE_INTEGER + 1])),
      "unsafe-integer",
    );
  }

  if (adapter.batch) {
    await adapter.batch([
      sql("INSERT INTO conformance_ids (id, label) VALUES (?, ?)", [2, "two"]),
      sql("INSERT INTO conformance_ids (id, label) VALUES (?, ?)", [3, "three"]),
    ]);
    const batched = await adapter.query<{ count: number }>(
      sql("SELECT COUNT(*) AS count FROM conformance_ids"),
    );
    if (Number(batched[0]?.count) !== 3) {
      throw new SearchError({
        code: "SEARCH_ADAPTER_ERROR",
        message: "adapter batch conformance failed",
        details: { reason: "batch" },
      });
    }
  }
}

async function expectRejects(run: () => Promise<unknown>, reason: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof SearchError) {
      return;
    }
    throw error;
  }
  throw new SearchError({
    code: "SEARCH_VALUE_INVALID",
    message: `expected adapter to reject ${reason}`,
    details: { reason },
  });
}
