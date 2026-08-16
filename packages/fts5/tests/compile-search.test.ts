import { describe, expect, test } from "bun:test";
import {
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  eq,
  inList,
  isNull,
  neq,
  notIn,
  parsePlainTextQuery,
  SearchError,
} from "@siftlite/core";
import { compileFilter, compileFts5PhysicalManifest, compileFts5Search } from "../src/index.ts";

function definition() {
  return defineIndex({
    name: "products",
    mode: "manual",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { title: { weight: 1 } },
    filterable: { status: "text", tenantId: "text", price: "number" },
    sortable: { price: "number" },
  });
}

function compile(options: {
  readonly query?: string;
  readonly filter?: Parameters<typeof compileFts5Search>[0]["filter"];
  readonly sort?: Parameters<typeof compileFts5Search>[0]["sort"];
  readonly runtimeLimits?: Parameters<typeof compileFts5Search>[0]["runtimeLimits"];
  readonly scope?: Parameters<typeof compileFts5Search>[0]["scope"];
}) {
  const def = definition();
  return compileFts5Search({
    definition: def,
    physical: compileFts5PhysicalManifest({
      definition: def,
      physicalIndexId: "proof",
      generation: 1,
    }),
    physicalIndexId: "proof",
    generation: 1,
    textQuery: parsePlainTextQuery(options.query ?? "sqlite", {
      limits: DEFAULT_APPLICATION_LIMITS,
    }),
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.sort ? { sort: options.sort } : {}),
    ...(options.scope ? { scope: options.scope } : {}),
    limit: 20,
    offset: 0,
    limits: DEFAULT_APPLICATION_LIMITS,
    ...(options.runtimeLimits ? { runtimeLimits: options.runtimeLimits } : {}),
  });
}

describe("FTS5 search compilation", () => {
  test("nested filters compile with documented NULL predicates", () => {
    const compiled = compileFilter(
      {
        op: "and",
        children: [neq("status", "active"), isNull("tenantId"), notIn("status", ["draft"])],
      },
      definition(),
    );
    expect(compiled.sql).toContain('d."status" <> ?');
    expect(compiled.sql).toContain('d."tenantId" IS NULL');
    expect(compiled.sql).toContain('d."status" NOT IN (?)');
    expect(compiled.sql).not.toContain("IS NOT NULL OR");
  });

  test("IN lists consume remaining bind budget after search, scope, and pagination", () => {
    expect(() =>
      compile({
        filter: inList("status", ["a", "b", "c", "d", "e", "f", "g"]),
        runtimeLimits: { maxBindParameters: 10 },
      }),
    ).not.toThrow();
    expect(() =>
      compile({
        filter: inList("status", ["a", "b", "c", "d", "e", "f", "g", "h"]),
        runtimeLimits: { maxBindParameters: 10 },
      }),
    ).toThrow(SearchError);
  });

  test("comparison filters reduce the remaining IN budget", () => {
    expect(() =>
      compile({
        filter: {
          op: "and",
          children: [eq("tenantId", "t1"), inList("status", ["a", "b", "c", "d", "e", "f", "g"])],
        },
        runtimeLimits: { maxBindParameters: 10 },
      }),
    ).toThrow(SearchError);
  });

  test("orders by requested fields then doc_id", () => {
    const compiled = compile({
      sort: [{ kind: "field", field: "price", direction: "desc" }],
    });
    expect(compiled.statement.sql).toContain('ORDER BY d."price" DESC, d."doc_id" ASC');
    expect(compiled.statement.sql).toContain("LIMIT ? OFFSET ?");
  });

  test("rejects relevance sort for empty-query browsing", () => {
    expect(() => compile({ query: "", sort: [{ kind: "relevance" }] })).toThrow(SearchError);
  });

  test("empty-query SQL does not emit MATCH and selects a null rank", () => {
    const compiled = compile({ query: "", sort: [] });
    expect(compiled.emptyQuery).toBe(true);
    expect(compiled.statement.sql).not.toContain("MATCH");
    expect(compiled.statement.sql).toContain("NULL AS rank");
    expect(compiled.statement.sql).toContain('ORDER BY d."doc_id" ASC');
  });
});
