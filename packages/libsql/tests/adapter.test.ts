import { describe, expect, test } from "bun:test";
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

  test("runs shared adapter and FTS5 conformance on local libSQL", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    await runSqlAdapterConformance(adapter);
    await runFts5SearchConformance(adapter);
    expect(adapter.id).toBe("libsql-local");
  });
});
