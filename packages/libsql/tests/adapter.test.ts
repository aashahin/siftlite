import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { runFts5SearchConformance, runSqlAdapterConformance } from "@siftlite/testing";
import {
  libsqlAdapter,
  libsqlRuntimeCapabilities,
  SIFTLITE_LIBSQL_PACKAGE,
  wrapLibsqlClient,
} from "../src/index.ts";

describe("@siftlite/libsql", () => {
  test("exports package identity and local capabilities", () => {
    expect(SIFTLITE_LIBSQL_PACKAGE.name).toBe("@siftlite/libsql");
    const local = libsqlRuntimeCapabilities("local");
    expect(local.transactions).toBe(true);
    expect(local.batch).toBe(true);
    expect(local.costSensitive).toBe(false);
    expect(libsqlRuntimeCapabilities("remote").costSensitive).toBe(true);
    expect(libsqlRuntimeCapabilities("remote").limits.maxBindParameters).toBeUndefined();
  });

  test("runs shared adapter and FTS5 conformance on local libSQL", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    await runSqlAdapterConformance(adapter);
    await runFts5SearchConformance(adapter);
    expect(adapter.id).toBe("libsql-local");
  });
});
