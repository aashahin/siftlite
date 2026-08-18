import { describe, expect, test } from "bun:test";
import {
  and,
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  eq,
  inList,
  isFilterNode,
  isNull,
  neq,
  not,
  notIn,
  or,
  SearchError,
  table,
  validateFilter,
} from "../src/index.ts";

const definition = defineIndex({
  name: "products",
  mode: "linked",
  source: table("products", { primaryKey: { field: "id", type: "string" } }),
  searchable: { name: { weight: 1 } },
  filterable: {
    status: "text",
    price: "number",
    count: "integer",
  },
});

describe("filter AST", () => {
  test("builders reject illegal scalars", () => {
    expect(() => eq("status", 1n)).toThrow(SearchError);
    expect(() => eq("price", Number.NaN)).toThrow(SearchError);
    expect(() => eq("price", Number.POSITIVE_INFINITY)).toThrow(SearchError);
    expect(() => eq("status", { ok: true })).toThrow(SearchError);
    expect(() => eq("status", new Date())).toThrow(SearchError);
    expect(() => inList("status", [])).toThrow(SearchError);
    expect(() => notIn("status", ["a", null])).toThrow(SearchError);
  });

  test("NULL membership is explicit", () => {
    expect(isNull("status")).toEqual({ op: "isNull", field: "status" });
    expect(neq("status", "active").op).toBe("neq");
    expect(isFilterNode(and(eq("status", "active"), isNull("price")))).toBe(true);
  });

  test("validates declared fields and codec kinds", () => {
    validateFilter(and(eq("status", "active"), eq("price", 10.5)), {
      limits: DEFAULT_APPLICATION_LIMITS,
      definition,
    });
    expect(() =>
      validateFilter(eq("brand", "x"), { limits: DEFAULT_APPLICATION_LIMITS, definition }),
    ).toThrow(SearchError);
    expect(() =>
      validateFilter(eq("count", 1.5), { limits: DEFAULT_APPLICATION_LIMITS, definition }),
    ).toThrow(SearchError);
  });

  test("enforces filter tree limits", () => {
    const deep = not(not(not(not(eq("status", "a")))));
    expect(() =>
      validateFilter(deep, {
        limits: { ...DEFAULT_APPLICATION_LIMITS, maxFilterDepth: 2 },
        definition,
      }),
    ).toThrow(SearchError);
    expect(() =>
      validateFilter(inList("status", ["a", "b", "c"]), {
        limits: { ...DEFAULT_APPLICATION_LIMITS, maxInValues: 2 },
        definition,
      }),
    ).toThrow(SearchError);
  });

  test("boolean nodes reject non-filter children", () => {
    expect(() => or()).toThrow(SearchError);
    expect(() => and({ kind: "bound-scope", predicates: [] } as never)).toThrow(SearchError);
  });

  test.each([
    ["non-array boolean children", { op: "and", children: "ab" }],
    ["null boolean child", { op: "and", children: [eq("status", "active"), null] }],
    ["eq without a field", { op: "eq" }],
    ["empty boolean children", { op: "and", children: [] }],
  ])("validateFilter rejects %s with SearchError", (_name, node) => {
    expect(() =>
      validateFilter(node as never, {
        limits: DEFAULT_APPLICATION_LIMITS,
        definition,
      }),
    ).toThrow(SearchError);
  });

  test("enforces maxFilterNodes during the walk", () => {
    expect(() =>
      validateFilter(and(eq("status", "a"), eq("status", "b"), eq("status", "c")), {
        limits: { ...DEFAULT_APPLICATION_LIMITS, maxFilterNodes: 2 },
        definition,
      }),
    ).toThrow(SearchError);
  });
});
