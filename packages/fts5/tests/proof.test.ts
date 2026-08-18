import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  bindScope,
  defineIndex,
  eq,
  parsePlainTextQuery,
  DEFAULT_APPLICATION_LIMITS,
  type SqlAdapter,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import {
  createManualFts5Proof,
  emitFts5Match,
  probeFts5Capabilities,
  sqliteFts5,
} from "../src/index.ts";

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
      price: "number",
    },
    sortable: {
      price: "number",
    },
    prefix: [2, 3],
  });
}

describe("FTS5 proof on Bun", () => {
  test("probes FTS5, trigram, vocab, and secure-delete capabilities", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const probes = await probeFts5Capabilities(adapter);
    expect(probes.fts5).toBe(true);
    expect(probes.trigramTokenizer).toBe(true);
    expect(probes.fts5Vocab).toBe(true);
    expect(typeof probes.fts5SecureDelete).toBe("boolean");
  });

  test("preserves string source IDs and ranks weighted title matches first", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const index = await createManualFts5Proof({
      adapter,
      definition: catalogDefinition(),
    });
    await index.upsert([
      {
        id: "000123",
        searchable: { title: "sqlite search", body: "hello world" },
        filterable: { status: "active", tenantId: "t1", price: 10 },
      },
      {
        id: "000124",
        searchable: { title: "hello world", body: "sqlite search" },
        filterable: { status: "active", tenantId: "t1", price: 20 },
      },
      {
        id: "000125",
        searchable: { title: "other", body: "unrelated" },
        filterable: { status: "draft", tenantId: "t2", price: 5 },
      },
    ]);

    const hits = await index.search("sqlite");
    expect(hits.map((hit) => hit.id)).toEqual(["000123", "000124"]);
    expect(hits[0]?.score).not.toBeNull();
    expect((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0)).toBe(true);

    const filtered = await index.search("sqlite", { filter: eq("status", "draft") });
    expect(filtered).toEqual([]);

    const scoped = await index.search("sqlite", { scope: bindScope({ tenantId: "t2" }) });
    expect(scoped.map((hit) => hit.id)).toEqual([]);

    await index.delete("000123");
    const afterDelete = await index.search("sqlite");
    expect(afterDelete.map((hit) => hit.id)).toEqual(["000124"]);
  });

  test("supports phrase, prefix, and numeric source IDs", async () => {
    const definition = defineIndex({
      name: "numeric_docs",
      mode: "manual",
      source: { table: "docs", primaryKey: { field: "id", type: "safe-integer" } },
      searchable: { title: { weight: 1 } },
      prefix: [2],
    });
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const index = await createManualFts5Proof({ adapter, definition });
    await index.upsert([
      { id: 10, searchable: { title: "iphone pro max" } },
      { id: 11, searchable: { title: "ipad air" } },
    ]);
    const phrase = await index.search('"iphone pro"');
    expect(phrase.map((hit) => hit.id)).toEqual([10]);
    const prefix = await index.search("ip", { matchingStrategy: "last-prefix" });
    expect(prefix.map((hit) => hit.id).sort()).toEqual([10, 11]);
    expect(typeof phrase[0]?.id).toBe("number");
  });

  test("ordinary malicious text never becomes raw MATCH grammar", () => {
    const parsed = parsePlainTextQuery("title:sqlite AND body:fts5 OR NEAR foo*", {
      limits: DEFAULT_APPLICATION_LIMITS,
    });
    const match = emitFts5Match(parsed);
    expect(match).toContain('"AND"');
    expect(match).toContain('"OR"');
    expect(match).toContain('"NEAR"');
    expect(match).toContain('"title"');
    expect(match).not.toContain("title:");
    expect(match?.includes("foo*")).toBe(false);
  });

  test("weight-only logical changes are runtime-only in the FTS5 manifest", () => {
    const backend = sqliteFts5();
    const left = catalogDefinition();
    const right = defineIndex({
      ...{
        name: "products",
        mode: "manual" as const,
        source: { table: "products", primaryKey: { field: "id", type: "string" as const } },
        searchable: { title: { weight: 9 }, body: { weight: 1 } },
        filterable: {
          status: "text" as const,
          tenantId: "text" as const,
          price: "number" as const,
        },
        sortable: { price: "number" as const },
        prefix: [2, 3],
      },
    });
    const previous = backend.compilePhysicalManifest({
      definition: left,
      physicalIndexId: "proof",
      generation: 1,
    });
    const next = backend.compilePhysicalManifest({
      definition: right,
      physicalIndexId: "proof",
      generation: 1,
    });
    expect(backend.classifyPhysicalChange(previous, next).kind).toBe("runtime-only");
  });

  test("batched upsert last-writes duplicate ids and respects bind budgets", async () => {
    const inner = bunSqliteAdapter(new Database(":memory:"));
    const adapter: SqlAdapter = {
      id: inner.id,
      dialect: inner.dialect,
      runtimeCapabilities: {
        ...inner.runtimeCapabilities,
        limits: { ...inner.runtimeCapabilities.limits, maxBindParameters: 3 },
      },
      query: async (statement) => {
        expect(statement.params.length).toBeLessThanOrEqual(3);
        return inner.query(statement);
      },
      execute: (statement) => inner.execute(statement),
      batch: (statements) => {
        const batch = inner.batch;
        if (!batch) {
          throw new Error("expected bun batch");
        }
        return batch.call(inner, statements);
      },
    };
    const index = await createManualFts5Proof({
      adapter,
      definition: catalogDefinition(),
    });
    await index.upsert([
      {
        id: "a",
        searchable: { title: "alpha", body: "one" },
        filterable: { status: "active", tenantId: "t1", price: 1 },
      },
      {
        id: "a",
        searchable: { title: "omega", body: "two" },
        filterable: { status: "active", tenantId: "t1", price: 2 },
      },
      {
        id: "b",
        searchable: { title: "beta", body: "three" },
        filterable: { status: "active", tenantId: "t1", price: 3 },
      },
      {
        id: "c",
        searchable: { title: "gamma", body: "four" },
        filterable: { status: "active", tenantId: "t1", price: 4 },
      },
    ]);
    expect((await index.search("omega")).map((hit) => hit.id)).toEqual(["a"]);
    expect((await index.search("alpha")).map((hit) => hit.id)).toEqual([]);
    expect((await index.search("beta")).map((hit) => hit.id)).toEqual(["b"]);
    expect((await index.search("gamma")).map((hit) => hit.id)).toEqual(["c"]);
  });

  test("TEXT manual indexes reject numeric source IDs so batched upsert cannot miss keys", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "notes",
      mode: "manual",
      searchable: { title: { weight: 1 } },
    });
    const index = await createManualFts5Proof({ adapter, definition });
    await expect(
      index.upsert([{ id: 123, searchable: { title: "numeric" } }]),
    ).rejects.toMatchObject({
      code: "SEARCH_VALUE_INVALID",
      details: { reason: "source-id-kind" },
    });
    await index.upsert([{ id: "123", searchable: { title: "text id" } }]);
    expect((await index.search("text")).map((hit) => hit.id)).toEqual(["123"]);
  });

  test("proof search rejects typo fallback even on a mutated definition", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = {
      ...catalogDefinition(),
      typoTolerance: { mode: "fallback" as const },
    };
    const index = await createManualFts5Proof({ adapter, definition });
    await expect(index.search("sqlite")).rejects.toMatchObject({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      details: { reason: "typo-fallback-unsupported" },
    });
  });

  test("search rejects limit 0 and huge offset via resolveSearchPage", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const index = await createManualFts5Proof({
      adapter,
      definition: catalogDefinition(),
    });
    await expect(index.search("sqlite", { limit: 0 })).rejects.toMatchObject({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
    });
    await expect(
      index.search("sqlite", { offset: DEFAULT_APPLICATION_LIMITS.maxOffset + 1 }),
    ).rejects.toMatchObject({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
    });
  });
});
