import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { SearchError, sql } from "@siftlite/core";
import { runFts5SearchConformance, runSqlAdapterConformance } from "@siftlite/testing";
import {
  libsqlAdapter,
  libsqlRuntimeCapabilities,
  wrapLibsqlClient,
  type LibsqlAdapterOptions,
} from "../src/index.ts";

describe("@siftlite/libsql", () => {
  test("local capabilities are proven and remote bind limits stay unproven", () => {
    const local = libsqlRuntimeCapabilities("local");
    expect(local.transactions).toBe(true);
    expect(local.batch).toBe(true);
    expect(local.costSensitive).toBe(false);
    expect(libsqlRuntimeCapabilities("remote").costSensitive).toBe(true);
    expect(libsqlRuntimeCapabilities("remote").limits.maxBindParameters).toBeUndefined();
  });

  test("remote consistency stays unproven until probed", () => {
    const remote = libsqlRuntimeCapabilities("remote");
    expect(remote.limits).toEqual({});
    expect(remote.consistency.transactionReadYourWrites).toBe(false);
    expect(remote.consistency.postCommitReadYourWrites).toBe(false);
    expect(remote.consistency.sessionAware).toBe(false);
    expect(remote.consistency.sequentialSessionConsistency).toBe(false);
    expect(remote.consistency.readReplicaEligible).toBe(false);
  });

  test("wrapLibsqlClient rejects clients without execute()", () => {
    expect(() => wrapLibsqlClient({})).toThrow(SearchError);
  });

  test("requires an explicit local or remote kind", () => {
    const official = {
      execute: async () => ({ rows: [], rowsAffected: 0 }),
    };
    expect(() => libsqlAdapter(wrapLibsqlClient(official), {} as LibsqlAdapterOptions)).toThrow(
      SearchError,
    );
  });

  test("wrapLibsqlClient forwards batch results and does not invent empty success", async () => {
    const official = {
      execute: async () => ({ rows: [], rowsAffected: 0 }),
      batch: async () => [{ rows: [], rowsAffected: 3 }],
    };
    const adapter = libsqlAdapter(wrapLibsqlClient(official), { kind: "local" });
    expect(adapter.batch).toBeTypeOf("function");
    const results = await adapter.batch?.([sql("SELECT 1")]);
    expect(results).toEqual([{ rowsAffected: 3 }]);
  });

  test("adapter.batch fails closed when the client has no batch()", async () => {
    const adapter = libsqlAdapter(
      wrapLibsqlClient({
        execute: async () => ({ rows: [], rowsAffected: 0 }),
      }),
      { kind: "local" },
    );
    expect(adapter.batch).toBeTypeOf("function");
    await expect(adapter.batch?.([sql("SELECT 1")])).rejects.toBeInstanceOf(SearchError);
  });

  test("normalizes safe bigint row values and rejects out-of-range bigints", async () => {
    const adapter = libsqlAdapter(
      wrapLibsqlClient({
        execute: async () => ({ rows: [{ ok: 1n }], rowsAffected: 0 }),
      }),
      { kind: "remote" },
    );
    await expect(adapter.query<{ ok: number }>(sql("SELECT 1 AS ok"))).resolves.toEqual([
      { ok: 1 },
    ]);

    const overflowing = libsqlAdapter(
      wrapLibsqlClient({
        execute: async () => ({
          rows: [{ ok: BigInt("9007199254740993") }],
          rowsAffected: 0,
        }),
      }),
      { kind: "remote" },
    );
    await expect(overflowing.query(sql("SELECT 1 AS ok"))).rejects.toBeInstanceOf(SearchError);
  });

  test("transaction batch preserves the official client this", async () => {
    const executed: string[] = [];
    const adapter = libsqlAdapter(
      wrapLibsqlClient({
        execute: async () => ({ rows: [], rowsAffected: 0 }),
        transaction: async () => ({
          label: "tx",
          execute: async () => ({ rows: [], rowsAffected: 0 }),
          batch(this: { label: string }, statements: readonly ({ sql?: string } | string)[]) {
            if (this.label !== "tx") {
              throw new Error("libSQL transaction lost this");
            }
            for (const statement of statements) {
              executed.push(typeof statement === "string" ? statement : (statement.sql ?? ""));
            }
            return Promise.resolve([{ rows: [], rowsAffected: 1 }]);
          },
          commit: async () => undefined,
          rollback: async () => undefined,
          close: () => undefined,
        }),
      }),
      { kind: "local" },
    );

    const results = await adapter.transaction?.(async (tx) => tx.batch?.([sql("INSERT INTO t")]));
    expect(results).toEqual([{ rowsAffected: 1 }]);
    expect(executed).toEqual(["INSERT INTO t"]);
  });

  test("query and execute work on local libSQL :memory:", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    await adapter.execute(sql("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"));
    await adapter.execute(sql("INSERT INTO items (name) VALUES (?)", ["alpha"]));
    const rows = await adapter.query<{ name: string }>(
      sql("SELECT name FROM items WHERE name = ?", ["alpha"]),
    );
    expect(rows).toEqual([{ name: "alpha" }]);
    client.close();
  });

  test("rejects unsafe integer binds", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    try {
      await expect(
        adapter.query(sql("SELECT ?", [Number.MAX_SAFE_INTEGER + 1])),
      ).rejects.toMatchObject({
        code: "SEARCH_VALUE_INVALID",
        details: { reason: "unsafe-integer" },
      });
    } finally {
      client.close();
    }
  });

  test("wraps driver errors without copying the driver message", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    const invalidSql = "THIS IS NOT VALID SQL";
    try {
      await adapter.query(sql(invalidSql));
      throw new Error("expected adapter to reject invalid SQL");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      const wrapped = error as SearchError;
      expect(wrapped.code).toBe("SEARCH_ADAPTER_ERROR");
      expect(wrapped.message).toBe("libSQL adapter error");
      expect(wrapped.message).not.toContain(invalidSql);
      expect(wrapped.cause).toBeDefined();
    } finally {
      client.close();
    }
  });

  test("transaction rollback errors do not hide the original failure", async () => {
    const adapter = libsqlAdapter(
      wrapLibsqlClient({
        execute: async () => ({ rows: [], rowsAffected: 0 }),
        transaction: async () => ({
          execute: async () => ({ rows: [], rowsAffected: 0 }),
          commit: async () => undefined,
          rollback: async () => {
            throw new Error("rollback-failed");
          },
          close: () => undefined,
        }),
      }),
      { kind: "local" },
    );

    try {
      await adapter.transaction?.(async () => {
        throw new Error("original-failure");
      });
      throw new Error("expected transaction to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      const wrapped = error as SearchError;
      expect(wrapped.code).toBe("SEARCH_ADAPTER_ERROR");
      expect(wrapped.message).toBe("libSQL adapter error");
      expect(wrapped.cause).toBeInstanceOf(Error);
      expect((wrapped.cause as Error).message).toBe("original-failure");
    }
  });

  test("runs shared adapter and FTS5 conformance on a local libSQL file database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "siftlite-libsql-"));
    const client = createClient({ url: `file:${join(dir, "conformance.db")}` });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    try {
      await runSqlAdapterConformance(adapter, { rejectUnsafeIntegers: true });
      await runFts5SearchConformance(adapter);
      expect(adapter.id).toBe("libsql-local");
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
