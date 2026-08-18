import { describe, expect, test } from "bun:test";
import {
  and,
  assertBoundScope,
  assertFilterCannotCarryScope,
  bindScope,
  composeScopedFilter,
  eq,
  isBoundScope,
  isFilterNode,
  not,
  or,
  SearchError,
} from "../src/index.ts";

describe("immutable bound scope", () => {
  test("is a distinct compiler-owned type", () => {
    const scope = bindScope({ tenantId: "t1" });
    expect(scope.kind).toBe("bound-scope");
    expect(isBoundScope(scope)).toBe(true);
    expect(isFilterNode(scope)).toBe(false);
    expect(isBoundScope(eq("tenantId", "t1"))).toBe(false);
  });

  test("user filters cannot wrap or negate a scope", () => {
    const scope = bindScope({ tenantId: "t1" });
    expect(() => and(scope as never)).toThrow(SearchError);
    expect(() => not(scope as never)).toThrow(SearchError);
    expect(() => or(eq("status", "active"), scope as never)).toThrow(SearchError);
  });

  test("composition always keeps scope outside the user AST", () => {
    const scope = bindScope({ tenantId: "t1" });
    const user = not(or(eq("tenantId", "t1"), eq("tenantId", "t2")));
    const composed = composeScopedFilter(scope, user);
    expect(composed.kind).toBe("scoped-filter");
    expect(composed.scope).toBe(scope);
    expect(composed.userFilter).toBe(user);
    assertFilterCannotCarryScope(user);
    expect(composed.scope.predicates).toEqual([
      { kind: "scope-eq", field: "tenantId", value: "t1" },
    ]);
  });

  test("composeScopedFilter rejects a user filter that carries a scope", () => {
    const scope = bindScope({ tenantId: "t1" });
    const sneaky = {
      op: "and" as const,
      children: [eq("status", "active"), scope],
    };
    expect(() => composeScopedFilter(scope, sneaky as never)).toThrow(SearchError);
  });

  test("rejects empty or illegal scope values", () => {
    expect(() => bindScope({})).toThrow(SearchError);
    expect(() => bindScope({ tenantId: 1n })).toThrow(SearchError);
    expect(() => bindScope({ "tenant id": "t1" })).toThrow(SearchError);
    expect(() => bindScope({ "": "t1" })).toThrow(SearchError);
  });

  test("rejects structurally invalid bound scopes", () => {
    expect(isBoundScope({ kind: "bound-scope", predicates: [{ kind: "scope-eq" }] })).toBe(false);
    expect(() =>
      assertBoundScope({ kind: "bound-scope", predicates: [{ kind: "scope-eq" }] }),
    ).toThrow(SearchError);
    expect(() =>
      composeScopedFilter({
        kind: "bound-scope",
        predicates: [{ kind: "scope-eq", field: "tenant id", value: "t1" }],
      } as never),
    ).toThrow(SearchError);
  });
});
