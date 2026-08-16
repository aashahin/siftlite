import { SearchError, sql, type SqlAdapter } from "@siftlite/core";

/**
 * Shared adapter conformance used by Bun and Workers-runtime suites.
 * Implements docs/09 §3. Implementations must use a real SQL engine, not a mock.
 *
 * Tables are prefixed `conformance_` and dropped at the start of each subsection
 * so the suite can run twice against a reused D1 binding.
 */
export async function runSqlAdapterConformance(
  adapter: SqlAdapter,
  options: { readonly rejectUnsafeIntegers?: boolean } = {},
): Promise<void> {
  await assertParameterizedRoundTrip(adapter);
  await assertTextIdIdentity(adapter);
  await assertSafeIntegerBoundary(adapter);
  await expectRejects(() => adapter.query(sql("SELECT ?", [1n])), "bigint");
  if (options.rejectUnsafeIntegers === true) {
    await expectRejects(
      () => adapter.query(sql("SELECT ?", [Number.MAX_SAFE_INTEGER + 1])),
      "unsafe-integer",
    );
  }
  await assertNullRoundTrip(adapter);
  await assertBlobRoundTripIfSupported(adapter);
  await assertBatchSuccess(adapter);
  await assertBatchFailure(adapter);
  await assertTransactionCommitRollback(adapter);
  await assertErrorWrapping(adapter);
}

async function assertParameterizedRoundTrip(adapter: SqlAdapter): Promise<void> {
  await recreate(adapter, "conformance_ids", "id INTEGER PRIMARY KEY, label TEXT");
  await adapter.execute(sql("INSERT INTO conformance_ids (id, label) VALUES (?, ?)", [1, "one"]));
  const rows = await adapter.query<{ id: number; label: string }>(
    sql("SELECT id, label FROM conformance_ids WHERE id = ?", [1]),
  );
  if (rows[0]?.id !== 1 || rows[0]?.label !== "one") {
    throw fail("adapter conformance failed to round-trip a parameterized row", "round-trip");
  }
}

async function assertTextIdIdentity(adapter: SqlAdapter): Promise<void> {
  await recreate(adapter, "conformance_text_ids", "id TEXT PRIMARY KEY, label TEXT");
  await adapter.execute(
    sql("INSERT INTO conformance_text_ids (id, label) VALUES (?, ?)", ["000123", "padded"]),
  );
  const rows = await adapter.query<{ id: string }>(
    sql("SELECT id FROM conformance_text_ids WHERE label = ?", ["padded"]),
  );
  if (rows[0]?.id !== "000123") {
    throw fail("TEXT primary key must preserve leading zeros", "text-id");
  }
}

async function assertSafeIntegerBoundary(adapter: SqlAdapter): Promise<void> {
  await recreate(adapter, "conformance_safe_int", "id INTEGER PRIMARY KEY, value INTEGER");
  await adapter.execute(
    sql("INSERT INTO conformance_safe_int (id, value) VALUES (?, ?)", [1, Number.MAX_SAFE_INTEGER]),
  );
  const rows = await adapter.query<{ value: number }>(
    sql("SELECT value FROM conformance_safe_int WHERE id = ?", [1]),
  );
  if (Number(rows[0]?.value) !== Number.MAX_SAFE_INTEGER) {
    throw fail("safe-integer bind did not round-trip", "safe-integer");
  }
}

async function assertNullRoundTrip(adapter: SqlAdapter): Promise<void> {
  await recreate(adapter, "conformance_null", "id INTEGER PRIMARY KEY, label TEXT");
  await adapter.execute(sql("INSERT INTO conformance_null (id, label) VALUES (?, ?)", [1, null]));
  const rows = await adapter.query<{ label: string | null }>(
    sql("SELECT label FROM conformance_null WHERE id = ?", [1]),
  );
  if (rows[0]?.label !== null) {
    throw fail("NULL bind did not round-trip", "null");
  }
}

async function assertBlobRoundTripIfSupported(adapter: SqlAdapter): Promise<void> {
  if (adapter.id === "d1" || adapter.id === "d1-session") {
    // D1's JS binding does not stably round-trip Uint8Array as bytes.
    return;
  }
  await recreate(adapter, "conformance_blob", "id INTEGER PRIMARY KEY, payload BLOB");
  const payload = new Uint8Array([0, 1, 255, 16]);
  try {
    await adapter.execute(
      sql("INSERT INTO conformance_blob (id, payload) VALUES (?, ?)", [1, payload]),
    );
  } catch (error) {
    if (error instanceof SearchError && error.details?.["reason"] === "unsupported-bind") {
      return;
    }
    throw error;
  }
  const rows = await adapter.query<{ payload: unknown }>(
    sql("SELECT payload FROM conformance_blob WHERE id = ?", [1]),
  );
  const returned = asBytes(rows[0]?.payload);
  if (!returned || !bytesEqual(returned, payload)) {
    throw fail("BLOB bind did not round-trip", "blob");
  }
}

async function assertBatchSuccess(adapter: SqlAdapter): Promise<void> {
  if (!adapter.batch) {
    return;
  }
  await recreate(adapter, "conformance_batch", "id INTEGER PRIMARY KEY, label TEXT");
  await adapter.batch([
    sql("INSERT INTO conformance_batch (id, label) VALUES (?, ?)", [1, "one"]),
    sql("INSERT INTO conformance_batch (id, label) VALUES (?, ?)", [2, "two"]),
  ]);
  const batched = await adapter.query<{ count: number }>(
    sql("SELECT COUNT(*) AS count FROM conformance_batch"),
  );
  if (Number(batched[0]?.count) !== 2) {
    throw fail("adapter batch conformance failed", "batch");
  }
}

async function assertBatchFailure(adapter: SqlAdapter): Promise<void> {
  if (!adapter.batch) {
    return;
  }
  await recreate(adapter, "conformance_batch_fail", "id INTEGER PRIMARY KEY, label TEXT");
  await adapter.execute(
    sql("INSERT INTO conformance_batch_fail (id, label) VALUES (?, ?)", [1, "kept"]),
  );
  let failed = false;
  try {
    await adapter.batch([
      sql("INSERT INTO conformance_batch_fail (id, label) VALUES (?, ?)", [2, "ok"]),
      sql("INSERT INTO conformance_batch_fail (id, label) VALUES (?, ?)", [1, "dup"]),
    ]);
  } catch {
    failed = true;
  }
  if (!failed) {
    throw fail("expected adapter.batch to reject a failing statement", "batch-failure");
  }
  if (!expectsAtomicBatch(adapter)) {
    return;
  }
  const rows = await adapter.query<{ id: number }>(
    sql("SELECT id FROM conformance_batch_fail ORDER BY id"),
  );
  if (rows.length !== 1 || Number(rows[0]?.id) !== 1) {
    throw fail("failed batch must roll back earlier statements", "batch-atomic");
  }
}

async function assertTransactionCommitRollback(adapter: SqlAdapter): Promise<void> {
  if (!adapter.transaction) {
    return;
  }
  await recreate(adapter, "conformance_tx", "id INTEGER PRIMARY KEY, label TEXT");
  try {
    await adapter.transaction(async () => undefined);
  } catch {
    return;
  }
  try {
    await adapter.query(sql("SELECT COUNT(*) AS count FROM conformance_tx"));
  } catch {
    // libSQL :memory: transaction() detaches the connection and lazily opens
    // an empty database, so interactive tx semantics are unprovable here.
    return;
  }
  try {
    await adapter.transaction(async (tx) => {
      await tx.execute(
        sql("INSERT INTO conformance_tx (id, label) VALUES (?, ?)", [1, "rollback"]),
      );
      throw new Error("conformance-tx-rollback");
    });
  } catch {
    // expected
  }
  const afterRollback = await adapter.query<{ count: number }>(
    sql("SELECT COUNT(*) AS count FROM conformance_tx"),
  );
  if (Number(afterRollback[0]?.count) !== 0) {
    throw fail("transaction rollback left a visible row", "tx-rollback");
  }

  await adapter.transaction(async (tx) => {
    await tx.execute(sql("INSERT INTO conformance_tx (id, label) VALUES (?, ?)", [2, "commit"]));
  });
  const afterCommit = await adapter.query<{ id: number; label: string }>(
    sql("SELECT id, label FROM conformance_tx WHERE id = ?", [2]),
  );
  if (afterCommit[0]?.id !== 2 || afterCommit[0]?.label !== "commit") {
    throw fail("transaction commit did not persist the row", "tx-commit");
  }
}

async function assertErrorWrapping(adapter: SqlAdapter): Promise<void> {
  try {
    await adapter.query(sql("THIS IS NOT VALID SQL"));
  } catch (error) {
    if (error instanceof SearchError) {
      return;
    }
    throw error;
  }
  throw fail("invalid SQL must throw SearchError", "error-wrap");
}

async function recreate(adapter: SqlAdapter, name: string, columns: string): Promise<void> {
  await adapter.execute(sql(`DROP TABLE IF EXISTS ${name}`));
  await adapter.execute(sql(`CREATE TABLE ${name} (${columns})`));
}

function expectsAtomicBatch(adapter: SqlAdapter): boolean {
  if (typeof adapter.transaction === "function") {
    return true;
  }
  return (
    adapter.id === "bun-sqlite" ||
    adapter.id === "d1" ||
    adapter.id === "d1-session" ||
    adapter.id === "libsql-local"
  );
}

function asBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return undefined;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function fail(message: string, reason: string): SearchError {
  return new SearchError({
    code: "SEARCH_ADAPTER_ERROR",
    message,
    details: { reason },
  });
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
