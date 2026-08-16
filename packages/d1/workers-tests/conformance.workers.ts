import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resolveEffectiveCapabilities } from "@siftlite/core";
import { FTS5_BASE_CAPABILITIES } from "@siftlite/fts5";
import { runFts5SearchConformance, runSqlAdapterConformance } from "@siftlite/testing";
import {
  D1_DEFAULT_SEARCH_POLICY,
  D1_SQL_LIMITS,
  d1Adapter,
  d1SessionAdapter,
} from "../src/index.ts";

interface D1TestEnv {
  readonly DB: Parameters<typeof d1Adapter>[0];
}

const testEnv = env as unknown as D1TestEnv;

describe("D1 Workers-runtime conformance", () => {
  it("runs shared adapter conformance inside workerd", async () => {
    const adapter = d1Adapter(testEnv.DB);
    expect(adapter.runtimeCapabilities.limits).toEqual(D1_SQL_LIMITS);
    await runSqlAdapterConformance(adapter, { rejectUnsafeIntegers: true });
  });

  it("runs shared FTS5 search conformance inside workerd", async () => {
    await runFts5SearchConformance(d1Adapter(testEnv.DB));
  });

  it("exposes session sequential-consistency capabilities", async () => {
    const session = d1SessionAdapter(testEnv.DB, "first-primary");
    expect(session.targetKind).toBe("session");
    expect(session.runtimeCapabilities.consistency.sessionAware).toBe(true);
    expect(session.runtimeCapabilities.consistency.sequentialSessionConsistency).toBe(true);
    await session.execute({
      sql: "CREATE TABLE session_probe (id INTEGER PRIMARY KEY, label TEXT)",
      params: [],
    });
    await session.execute({
      sql: "INSERT INTO session_probe (id, label) VALUES (?, ?)",
      params: [1, "visible"],
    });
    const rows = await session.query<{ label: string }>({
      sql: "SELECT label FROM session_probe WHERE id = ?",
      params: [1],
    });
    expect(rows[0]?.label).toBe("visible");
    expect(typeof session.getBookmark() === "string" || session.getBookmark() === null).toBe(true);
  });

  it("keeps D1 typo fallback disabled by default", () => {
    const adapter = d1Adapter(testEnv.DB);
    const effective = resolveEffectiveCapabilities({
      backend: FTS5_BASE_CAPABILITIES,
      runtime: adapter.runtimeCapabilities,
      probes: { trigramTokenizer: true },
      policy: D1_DEFAULT_SEARCH_POLICY,
    });
    expect(effective.features.typoFallback).toBe(false);
  });
});
