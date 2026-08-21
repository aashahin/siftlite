import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  bindScope,
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  eq,
  or,
  quoteIdent,
  sql,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { createManualFts5Proof, physicalNames, searchFts5Index } from "../src/index.ts";

function fuzzyCatalog() {
  return defineIndex({
    name: "gadgets",
    mode: "manual",
    searchable: { title: { weight: 1 } },
    filterable: {
      status: "text",
      tenantId: "text",
      brand: "text",
    },
    facets: ["brand"],
    typoTolerance: { mode: "fallback" },
  });
}

async function seedFuzzy(
  documents: readonly {
    readonly id: string;
    readonly title: string;
    readonly status?: string | null;
    readonly tenantId?: string | null;
    readonly brand?: string | null;
  }[],
  limits = DEFAULT_APPLICATION_LIMITS,
) {
  const adapter = bunSqliteAdapter(new Database(":memory:"));
  const definition = fuzzyCatalog();
  const index = await createManualFts5Proof({ adapter, definition, limits });
  await index.upsert(
    documents.map((document) => ({
      id: document.id,
      searchable: { title: document.title },
      filterable: {
        status: document.status ?? "active",
        tenantId: document.tenantId ?? "t1",
        brand: document.brand ?? "acme",
      },
    })),
  );
  return {
    adapter,
    definition,
    physicalIndexId: index.physicalIndexId,
    generation: index.generation,
    limits,
  };
}

describe("Phase 12 fuzzy request-equivalent search", () => {
  test("iphoen falls back to iphone after exact misses", async () => {
    const ctx = await seedFuzzy([{ id: "n1", title: "iphone" }]);
    const exact = await searchFts5Index(ctx, "iphone", { diagnostics: true });
    expect(exact.hits.map((hit) => hit.id)).toEqual(["n1"]);
    expect(exact.meta?.fuzzyUsed).toBe(false);

    const fuzzy = await searchFts5Index(ctx, "iphoen", { diagnostics: true });
    expect(fuzzy.hits.map((hit) => hit.id)).toEqual(["n1"]);
    expect(fuzzy.meta?.fuzzyUsed).toBe(true);
  });

  test("tenant scope cannot be bypassed by fuzzy fallback", async () => {
    const ctx = await seedFuzzy([
      { id: "a", title: "iphone", tenantId: "t1", status: "active" },
      { id: "b", title: "iphone", tenantId: "t2", status: "active" },
    ]);
    const scoped = await searchFts5Index(ctx, "iphoen", {
      scope: bindScope({ tenantId: "t1" }),
      filter: or(eq("tenantId", "t2"), eq("status", "active")),
      diagnostics: true,
    });
    expect(scoped.meta?.fuzzyUsed).toBe(true);
    expect(scoped.hits.map((hit) => hit.id)).toEqual(["a"]);
    expect(scoped.hits.map((hit) => hit.id)).not.toContain("b");
  });

  test("request filter is preserved on fuzzy candidates", async () => {
    const ctx = await seedFuzzy([
      { id: "a", title: "iphone", status: "active" },
      { id: "b", title: "iphone", status: "draft" },
    ]);
    const filtered = await searchFts5Index(ctx, "iphoen", {
      filter: eq("status", "active"),
      diagnostics: true,
    });
    expect(filtered.meta?.fuzzyUsed).toBe(true);
    expect(filtered.hits.map((hit) => hit.id)).toEqual(["a"]);
  });

  test("minGramOverlap skips candidates before edit-distance", async () => {
    const ctx = await seedFuzzy([
      { id: "keep", title: "iphone" },
      { id: "overlap-only", title: "phonebook" },
      { id: "mutated", title: "iphone" },
    ]);
    const names = physicalNames(ctx.definition, ctx.physicalIndexId, ctx.generation);
    await ctx.adapter.execute(
      sql(
        `UPDATE ${quoteIdent(names.docs)} SET ${quoteIdent("title_source")} = ? WHERE ${quoteIdent("source_id")} = ?`,
        ["zzzzzzzzzz", "mutated"],
      ),
    );

    const result = await searchFts5Index(ctx, "iphoen", { diagnostics: true });
    expect(result.meta?.fuzzyUsed).toBe(true);
    expect(result.hits.map((hit) => hit.id)).toEqual(["keep"]);
    expect(result.hits.map((hit) => hit.id)).not.toContain("overlap-only");
    expect(result.hits.map((hit) => hit.id)).not.toContain("mutated");
  });

  test("maxFuzzyCandidates caps trigram candidate retrieval", async () => {
    const limits = { ...DEFAULT_APPLICATION_LIMITS, maxFuzzyCandidates: 2 };
    const ctx = await seedFuzzy(
      ["one", "two", "three", "four", "five"].map((suffix, index) => ({
        id: `g${index}`,
        title: `iphone ${suffix}`,
      })),
      limits,
    );
    const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
    const original = ctx.adapter.query.bind(ctx.adapter);
    ctx.adapter.query = async (statement) => {
      queries.push({ sql: statement.sql, params: statement.params });
      return original(statement);
    };

    const result = await searchFts5Index(ctx, "iphoen", {
      includeTotal: true,
      diagnostics: true,
    });
    const candidate = queries.find(
      (statement) => statement.sql.includes("_tri") && statement.sql.includes("MATCH"),
    );
    expect(candidate?.params.at(-1)).toBe(2);
    expect(result.hits.length).toBeLessThanOrEqual(2);
    expect(result.totalHits).toBeLessThanOrEqual(2);
    expect(result.meta?.fuzzyUsed).toBe(true);
  });

  test("candidate searchable text is batch-loaded in O(chunks) queries", async () => {
    const limits = { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 2 };
    const ctx = await seedFuzzy(
      ["one", "two", "three", "four", "five"].map((suffix, index) => ({
        id: `g${index}`,
        title: `iphone ${suffix}`,
      })),
      limits,
    );
    const queries: string[] = [];
    const original = ctx.adapter.query.bind(ctx.adapter);
    ctx.adapter.query = async (statement) => {
      queries.push(statement.sql);
      return original(statement);
    };

    const result = await searchFts5Index(ctx, "iphoen", { diagnostics: true });
    expect(result.meta?.fuzzyUsed).toBe(true);
    expect(result.hits.length).toBe(5);
    const sourceInQueries = queries.filter(
      (statement) => statement.includes("_source") && /IN\s*\(/.test(statement),
    );
    expect(sourceInQueries.length).toBe(3);
    expect(sourceInQueries.some((statement) => /IN \(\?(?:, \?){2,}/.test(statement))).toBe(false);
    expect(
      queries.filter((statement) => /_source/.test(statement) && /=\s*\?/.test(statement)).length,
    ).toBe(0);
  });

  test("fuzzy paging, includeTotal, and facets use survivor IDs", async () => {
    const ctx = await seedFuzzy([
      { id: "a", title: "iphone", brand: "acme" },
      { id: "b", title: "the iphone", brand: "acme" },
      { id: "c", title: "iphone case", brand: "beta" },
    ]);
    const queries: string[] = [];
    const original = ctx.adapter.query.bind(ctx.adapter);
    ctx.adapter.query = async (statement) => {
      queries.push(statement.sql);
      return original(statement);
    };

    const first = await searchFts5Index(ctx, "iphoen", {
      limit: 1,
      offset: 0,
      includeTotal: true,
      facets: ["brand"],
      diagnostics: true,
    });
    expect(first.meta?.fuzzyUsed).toBe(true);
    expect(first.hits).toHaveLength(1);
    expect(first.page).toEqual({ limit: 1, offset: 0, hasMore: true });
    expect(first.totalHits).toBe(3);
    expect(first.facets?.["brand"]).toEqual([
      { value: "acme", count: 2 },
      { value: "beta", count: 1 },
    ]);
    expect(queries.some((statement) => /COUNT\(\*\) AS total/.test(statement))).toBe(true);
    expect(
      queries
        .filter((statement) => statement.includes("GROUP BY"))
        .every((statement) => statement.includes("IN (") && !statement.includes("MATCH")),
    ).toBe(true);

    const last = await searchFts5Index(ctx, "iphoen", { limit: 1, offset: 2 });
    expect(last.hits).toHaveLength(1);
    expect(last.page.hasMore).toBe(false);
  });

  test("highlight is omitted with a fuzzy warning", async () => {
    const ctx = await seedFuzzy([{ id: "n1", title: "iphone" }]);
    const result = await searchFts5Index(ctx, "iphoen", {
      highlight: ["title"],
      diagnostics: true,
    });
    expect(result.meta?.fuzzyUsed).toBe(true);
    expect(result.hits[0]?.formatted).toBeUndefined();
    expect(result.warnings?.some((warning) => warning.code === "highlight-unavailable-fuzzy")).toBe(
      true,
    );
  });

  test("fuzzy hits append after exact hits and never displace them", async () => {
    const ctx = await seedFuzzy([
      { id: "exact", title: "iphone", brand: "acme" },
      { id: "typo", title: "iphoen", brand: "beta" },
    ]);
    const result = await searchFts5Index(ctx, "iphone", {
      includeTotal: true,
      facets: ["brand"],
      diagnostics: true,
    });
    expect(result.hits.map((hit) => hit.id)).toEqual(["exact", "typo"]);
    expect(result.hits[0]?.score).not.toBeNull();
    expect(result.hits[1]?.score).toBeNull();
    expect(result.meta?.fuzzyUsed).toBe(true);
    expect(result.totalHits).toBe(2);
    expect(result.facets?.["brand"]).toEqual([
      { value: "acme", count: 1 },
      { value: "beta", count: 1 },
    ]);
  });

  test("merged paging walks exact then fuzzy", async () => {
    const ctx = await seedFuzzy([
      { id: "exact", title: "iphone" },
      { id: "typo", title: "iphoen" },
    ]);
    const first = await searchFts5Index(ctx, "iphone", { limit: 1, offset: 0, diagnostics: true });
    expect(first.hits.map((hit) => hit.id)).toEqual(["exact"]);
    expect(first.page.hasMore).toBe(true);
    expect(first.hits[0]?.score).not.toBeNull();

    const second = await searchFts5Index(ctx, "iphone", { limit: 1, offset: 1, diagnostics: true });
    expect(second.hits.map((hit) => hit.id)).toEqual(["typo"]);
    expect(second.hits[0]?.score).toBeNull();
    expect(second.page.hasMore).toBe(false);
    expect(second.meta?.fuzzyUsed).toBe(true);
  });

  test("exact-only pages do not flag highlight-unavailable-fuzzy", async () => {
    const ctx = await seedFuzzy([
      { id: "exact", title: "iphone" },
      { id: "typo", title: "iphoen" },
    ]);
    const result = await searchFts5Index(ctx, "iphone", {
      limit: 1,
      highlight: ["title"],
      diagnostics: true,
    });
    expect(result.hits.map((hit) => hit.id)).toEqual(["exact"]);
    expect(result.hits[0]?.formatted?.["title"]).toEqual(expect.any(String));
    expect(
      (result.warnings ?? []).some((warning) => warning.code === "highlight-unavailable-fuzzy"),
    ).toBe(false);
  });
});
