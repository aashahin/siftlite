import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  and,
  bindScope,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  desc,
  eq,
  inList,
  isNull,
  neq,
  notIn,
  or,
  SearchError,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { createManualFts5Proof, searchFts5Index, searchFts5IndexRaw, unsafeFts5Query } from "../src/index.ts";

function catalogDefinition() {
  return defineIndex({
    name: "products",
    mode: "manual",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: {
      title: { weight: 5 },
      body: { weight: 1 },
    },
    filterable: {
      status: "text",
      tenantId: "text",
      brand: "text",
      price: "number",
    },
    sortable: {
      price: "number",
    },
    facets: ["brand", "price"],
    synonyms: {
      sqlite: ["fts5"],
    },
    prefix: [2, 3],
  });
}

async function seed() {
  const adapter = bunSqliteAdapter(new Database(":memory:"));
  const definition = catalogDefinition();
  const index = await createManualFts5Proof({ adapter, definition });
  await index.upsert([
    {
      id: "a",
      searchable: { title: "sqlite search", body: "portable query engine" },
      filterable: { status: "active", tenantId: "t1", brand: "acme", price: 10 },
    },
    {
      id: "b",
      searchable: { title: "fts5 handbook", body: "manual mode" },
      filterable: { status: "active", tenantId: "t1", brand: "acme", price: 20 },
    },
    {
      id: "c",
      searchable: { title: "other title", body: "unrelated" },
      filterable: { status: "draft", tenantId: "t2", brand: "beta", price: 5 },
    },
    {
      id: "d",
      searchable: { title: "null status", body: "sqlite missing status" },
      filterable: { status: null, tenantId: "t1", brand: null, price: 15 },
    },
  ]);
  return {
    adapter,
    definition,
    physicalIndexId: index.physicalIndexId,
    generation: index.generation,
  };
}

describe("Phase 6 application search semantics", () => {
  test("nested filters follow SQL NULL behavior", async () => {
    const ctx = await seed();
    const neqActive = await searchFts5Index(ctx, "sqlite", { filter: neq("status", "active") });
    expect(neqActive.hits.map((hit) => hit.id)).toEqual([]);

    const notInActive = await searchFts5Index(ctx, "sqlite", {
      filter: notIn("status", ["active"]),
    });
    expect(notInActive.hits.map((hit) => hit.id)).toEqual([]);

    const nullStatus = await searchFts5Index(ctx, "sqlite", { filter: isNull("status") });
    expect(nullStatus.hits.map((hit) => hit.id)).toEqual(["d"]);

    const nested = await searchFts5Index(ctx, "", {
      sort: [desc("price")],
      filter: and(eq("tenantId", "t1"), isNull("status")),
    });
    expect(nested.hits.map((hit) => hit.id)).toEqual(["d"]);
  });

  test("empty-query browsing returns null scores and hasMore without totals", async () => {
    const ctx = await seed();
    const result = await searchFts5Index(ctx, "", {
      sort: [desc("price")],
      limit: 2,
      offset: 0,
    });
    expect(result.hits.map((hit) => hit.id)).toEqual(["b", "d"]);
    expect(result.hits.every((hit) => hit.score === null)).toBe(true);
    expect(result.page).toEqual({ limit: 2, offset: 0, hasMore: true });
    expect(result.totalHits).toBeUndefined();

    const next = await searchFts5Index(ctx, "", {
      sort: [desc("price")],
      limit: 2,
      offset: 2,
    });
    expect(next.hits.map((hit) => hit.id)).toEqual(["a", "c"]);
    expect(next.page.hasMore).toBe(false);
  });

  test("includeTotal is opt-in and does not run unless requested", async () => {
    const ctx = await seed();
    const queries: string[] = [];
    const original = ctx.adapter.query.bind(ctx.adapter);
    ctx.adapter.query = async (statement) => {
      queries.push(statement.sql);
      return original(statement);
    };

    const withoutTotal = await searchFts5Index(ctx, "sqlite");
    expect(withoutTotal.totalHits).toBeUndefined();
    expect(queries.some((sql) => /COUNT\(\*\)/.test(sql))).toBe(false);

    const withTotal = await searchFts5Index(ctx, "sqlite", { includeTotal: true });
    expect(withTotal.totalHits).toBe(3);
    expect(queries.some((sql) => /COUNT\(\*\)/.test(sql))).toBe(true);
  });

  test("conjunctive facets exclude NULL and compute numeric stats", async () => {
    const ctx = await seed();
    const result = await searchFts5Index(ctx, "", {
      sort: [desc("price")],
      filter: eq("tenantId", "t1"),
      facets: ["brand", "price"],
    });
    expect(result.facets?.["brand"]).toEqual([{ value: "acme", count: 2 }]);
    expect(result.facets?.["brand"]?.some((bucket) => bucket.value === null)).toBe(false);
    expect(result.facetStats?.["price"]).toEqual({ min: 10, max: 20 });
  });

  test("query-time synonyms expand without rewriting stored documents", async () => {
    const ctx = await seed();
    const result = await searchFts5Index(ctx, "sqlite");
    expect(result.hits.map((hit) => hit.id).sort()).toEqual(["a", "b", "d"]);
  });

  test("highlight is capability-gated and uses caller markers, not trusted HTML", async () => {
    const ctx = await seed();
    const result = await searchFts5Index(ctx, "sqlite", {
      highlight: ["title"],
      highlightMarkers: { start: "[[", end: "]]", ellipsis: "…" },
    });
    const formatted = result.hits.find((hit) => hit.id === "a")?.formatted?.["title"];
    expect(formatted).toContain("[[");
    expect(formatted).toContain("]]");
    expect(result.hits[0]?.formatted?.["title"] ?? "").not.toMatch(/<script/i);
  });

  test("hydration is batched, rank-preserving, and keeps string IDs", async () => {
    const ctx = await seed();
    const budget = createStatementBudget(
      { maxBindParameters: 2 },
      { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 2 },
    );
    expect(budget.application.maxInValues).toBe(2);

    const queries: string[] = [];
    const original = ctx.adapter.query.bind(ctx.adapter);
    ctx.adapter.query = async (statement) => {
      queries.push(statement.sql);
      return original(statement);
    };

    const result = await searchFts5Index(
      {
        ...ctx,
        limits: { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 2 },
      },
      "",
      {
        sort: [desc("price")],
        hydrate: true,
        limit: 3,
      },
    );
    expect(result.hits.map((hit) => hit.id)).toEqual(["b", "d", "a"]);
    expect(result.hits.every((hit) => typeof hit.id === "string")).toBe(true);
    expect(result.hits[0]?.document?.["title"]).toBe("fts5 handbook");
    expect(result.hits[0]?.document?.["id"]).toBe("b");
    expect(queries.filter((sql) => sql.includes("IN (")).length).toBeGreaterThanOrEqual(2);
    expect(queries.some((sql) => /IN \(\?, \?, \?/.test(sql))).toBe(false);
  });

  test("immutable scope applies to hits, facets, totals, and hydration", async () => {
    const ctx = await seed();
    const result = await searchFts5Index(ctx, "", {
      sort: [desc("price")],
      scope: bindScope({ tenantId: "t2" }),
      filter: or(eq("tenantId", "t1"), eq("status", "draft")),
      facets: ["brand"],
      includeTotal: true,
      hydrate: true,
    });
    expect(result.hits.map((hit) => hit.id)).toEqual(["c"]);
    expect(result.totalHits).toBe(1);
    expect(result.facets?.["brand"]).toEqual([{ value: "beta", count: 1 }]);
    expect(result.hits[0]?.document?.["tenantId"]).toBe("t2");
  });

  test("diagnostics omit SQL, bound values, and query secrets", async () => {
    const ctx = await seed();
    const result = await searchFts5Index(ctx, "sqlite", {
      filter: eq("status", "active"),
      diagnostics: true,
    });
    expect(result.meta?.backend).toBe("fts5");
    expect(result.meta?.runtime).toBe("bun-sqlite");
    expect(result.meta?.fuzzyUsed).toBe(false);
    expect((result.meta?.bindParametersUsed ?? 0) > 0).toBe(true);
    const serialized = JSON.stringify(result.meta);
    expect(serialized).not.toContain("MATCH");
    expect(serialized).not.toContain("active");
    expect(result.meta).not.toHaveProperty("query");
    expect(result.meta).not.toHaveProperty("sql");
    expect(result.meta).not.toHaveProperty("params");
  });

  test("over-budget IN lists fail before execution", async () => {
    const values = Array.from({ length: 8 }, (_, index) => `s${index}`);
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    Object.defineProperty(adapter, "runtimeCapabilities", {
      value: {
        ...adapter.runtimeCapabilities,
        limits: { maxBindParameters: 10 },
      },
    });
    const definition = catalogDefinition();
    const index = await createManualFts5Proof({ adapter, definition });
    await expect(
      searchFts5Index(
        {
          adapter,
          definition,
          physicalIndexId: index.physicalIndexId,
          generation: index.generation,
        },
        "sqlite",
        { filter: inList("status", values) },
      ),
    ).rejects.toThrow(SearchError);
  });

  test("searchRaw binds unsafe FTS5 grammar while ordinary text stays escaped", async () => {
    const ctx = await seed();
    const raw = await searchFts5IndexRaw(ctx, unsafeFts5Query('title:"sqlite"'));
    expect(raw.hits.map((hit) => hit.id)).toEqual(["a"]);

    const ordinary = await searchFts5Index(ctx, 'title:"sqlite"');
    expect(ordinary.hits.map((hit) => hit.id)).toEqual([]);
  });

  test("aborted AbortSignal fails before SQL execution", async () => {
    const ctx = await seed();
    let queries = 0;
    const original = ctx.adapter.query.bind(ctx.adapter);
    ctx.adapter.query = async (statement) => {
      queries += 1;
      return original(statement);
    };
    await expect(
      searchFts5Index(ctx, "sqlite", { signal: AbortSignal.abort() }),
    ).rejects.toThrow(SearchError);
    expect(queries).toBe(0);
  });
});
