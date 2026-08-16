import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { SearchError, sql } from "@siftlite/core";
import { runFts5SearchConformance, runSqlAdapterConformance } from "@siftlite/testing";
import { libsqlAdapter, libsqlRuntimeCapabilities, wrapLibsqlClient } from "../src/index.ts";

describe("@siftlite/libsql", () => {
  test("local capabilities are proven and remote bind limits stay unproven", () => {
    const local = libsqlRuntimeCapabilities("local");
    expect(local.transactions).toBe(true);
    expect(local.batch).toBe(true);
    expect(local.costSensitive).toBe(false);
    expect(libsqlRuntimeCapabilities("remote").costSensitive).toBe(true);
    expect(libsqlRuntimeCapabilities("remote").limits.maxBindParameters).toBeUndefined();
  });

  test("wrapLibsqlClient rejects clients without execute()", () => {
    expect(() => wrapLibsqlClient({})).toThrow(SearchError);
  });

  test("wrapLibsqlClient forwards batch results and does not invent empty success", async () => {
    const official = {
      execute: async () => ({ rows: [], rowsAffected: 0 }),
      batch: async () => [{ rows: [], rowsAffected: 3 }],
    };
    const { batch } = libsqlAdapter(wrapLibsqlClient(official));
    expect(batch).toBeTypeOf("function");
    const results = await batch?.([sql("SELECT 1")]);
    expect(results).toEqual([{ rowsAffected: 3 }]);
  });

  test("adapter.batch fails closed when the client has no batch()", async () => {
    const { batch } = libsqlAdapter(
      wrapLibsqlClient({
        execute: async () => ({ rows: [], rowsAffected: 0 }),
      }),
    );
    expect(batch).toBeTypeOf("function");
    await expect(batch?.([sql("SELECT 1")])).rejects.toBeInstanceOf(SearchError);
  });

  test("runs shared adapter and FTS5 conformance on local libSQL", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    await runSqlAdapterConformance(adapter);
    await runFts5SearchConformance(adapter);
    expect(adapter.id).toBe("libsql-local");
  });
});
