import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  assertInListFits,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  physicalIndexIdFor,
  resolveEffectiveCapabilities,
} from "@siftlite/core";
import { createIndex, dropIndex, FTS5_BASE_CAPABILITIES, searchFts5Index } from "@siftlite/fts5";
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
      sql: "DROP TABLE IF EXISTS session_probe",
      params: [],
    });
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
    const bookmark = session.getBookmark();
    expect(typeof bookmark === "string" || bookmark === null).toBe(true);
    // Bookmark continuation is skipped when the runtime returns null
    // (local Miniflare / workerd often has no bookmark until a remote primary).
    if (typeof bookmark === "string") {
      const continued = d1SessionAdapter(testEnv.DB, bookmark);
      const continuedRows = await continued.query<{ label: string }>({
        sql: "SELECT label FROM session_probe WHERE id = ?",
        params: [1],
      });
      expect(continuedRows[0]?.label).toBe("visible");
    }
  });

  it("accepts documented bind-parameter limit and fails closed over budget", async () => {
    const adapter = d1Adapter(testEnv.DB);
    const max = D1_SQL_LIMITS.maxBindParameters ?? 100;
    await adapter.execute({ sql: "DROP TABLE IF EXISTS d1_bind_probe", params: [] });
    await adapter.execute({
      sql: "CREATE TABLE d1_bind_probe (id INTEGER PRIMARY KEY)",
      params: [],
    });
    await adapter.execute({ sql: "INSERT INTO d1_bind_probe (id) VALUES (?)", params: [1] });
    const placeholders = Array.from({ length: max }, () => "?").join(", ");
    const atLimit = await adapter.query<{ id: number }>({
      sql: `SELECT id FROM d1_bind_probe WHERE id IN (${placeholders})`,
      params: Array.from({ length: max }, (_, index) => (index === 0 ? 1 : index + 2)),
    });
    expect(atLimit[0]?.id).toBe(1);

    const over = max + 1;
    const budget = createStatementBudget(D1_SQL_LIMITS, DEFAULT_APPLICATION_LIMITS);
    expect(() => assertInListFits(budget, over)).toThrow();
  });

  it("keeps linked FTS5 triggers synchronized on raw SQL writes", async () => {
    const adapter = d1Adapter(testEnv.DB);
    const definition = defineIndex({
      name: "d1_orm_products",
      mode: "linked",
      source: { table: "d1_orm_products", primaryKey: { field: "id", type: "string" } },
      searchable: { name: { weight: 5 }, description: { weight: 1 } },
      filterable: { status: "text" },
    });
    await dropIndex({ adapter, definition }).catch(() => undefined);
    await adapter.execute({ sql: "DROP TABLE IF EXISTS d1_orm_products", params: [] });
    await adapter.execute({
      sql: `CREATE TABLE d1_orm_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL
      )`,
      params: [],
    });
    await createIndex({ adapter, definition });
    const searchCtx = {
      adapter,
      definition,
      physicalIndexId: physicalIndexIdFor("d1_orm_products"),
      generation: 1,
    };

    await adapter.execute({
      sql: "INSERT INTO d1_orm_products (id, name, description, status) VALUES (?, ?, ?, ?)",
      params: ["d1", "d1 phone", "trigger write", "active"],
    });
    expect((await searchFts5Index(searchCtx, "phone")).hits.map((hit) => hit.id)).toEqual(["d1"]);

    await adapter.execute({
      sql: "UPDATE d1_orm_products SET name = ? WHERE id = ?",
      params: ["renamed widget", "d1"],
    });
    expect((await searchFts5Index(searchCtx, "phone")).hits).toEqual([]);
    expect((await searchFts5Index(searchCtx, "widget")).hits.map((hit) => hit.id)).toEqual(["d1"]);

    await adapter.execute({
      sql: "DELETE FROM d1_orm_products WHERE id = ?",
      params: ["d1"],
    });
    expect((await searchFts5Index(searchCtx, "widget")).hits).toEqual([]);
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
