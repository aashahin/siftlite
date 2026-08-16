import { SearchError } from "../errors/search-error.js";
import { assertPortableScalar, type PortableScalar } from "./scalar.js";
import type { FilterNode } from "./filter.js";
import { isFilterNode } from "./filter.js";

/**
 * Compiler-owned equality predicate. This is not a user filter node and cannot
 * appear inside `and` / `or` / `not`.
 */
export interface ScopePredicate {
  readonly kind: "scope-eq";
  readonly field: string;
  readonly value: PortableScalar;
}

/**
 * Immutable bound application/tenant scope.
 *
 * User filters are always ANDed beneath this predicate and cannot remove,
 * override, widen, or negate it.
 */
export interface BoundScope {
  readonly kind: "bound-scope";
  readonly predicates: readonly ScopePredicate[];
}

export interface ScopedFilter {
  readonly kind: "scoped-filter";
  readonly scope: BoundScope;
  readonly userFilter: FilterNode | undefined;
}

export function isBoundScope(value: unknown): value is BoundScope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "bound-scope" &&
    Array.isArray((value as { predicates?: unknown }).predicates)
  );
}

export function bindScope(values: Readonly<Record<string, unknown>>): BoundScope {
  const predicates = Object.entries(values).map(([field, value]) => {
    if (field.length === 0) {
      throw new SearchError({
        code: "SEARCH_SCOPE_INVALID",
        message: "scope field names must be non-empty",
        details: { reason: "empty-field" },
      });
    }
    return {
      kind: "scope-eq" as const,
      field,
      value: assertPortableScalar(value, field),
    };
  });
  if (predicates.length === 0) {
    throw new SearchError({
      code: "SEARCH_SCOPE_INVALID",
      message: "scope requires at least one predicate",
      details: { reason: "empty-scope" },
    });
  }
  return { kind: "bound-scope", predicates };
}

export function composeScopedFilter(scope: BoundScope, userFilter?: FilterNode): ScopedFilter {
  if (!isBoundScope(scope)) {
    throw new SearchError({
      code: "SEARCH_SCOPE_INVALID",
      message: "composeScopedFilter requires a bound scope",
      details: { reason: "missing-scope" },
    });
  }
  if (userFilter !== undefined) {
    if (!isFilterNode(userFilter)) {
      throw new SearchError({
        code: "SEARCH_FILTER_INVALID",
        message: "user filter must be a filter AST node",
        details: { reason: "invalid-user-filter" },
      });
    }
    assertFilterCannotCarryScope(userFilter);
  }
  return {
    kind: "scoped-filter",
    scope,
    userFilter,
  };
}

/**
 * Structural guarantee: a user filter tree never contains a bound scope.
 */
export function assertFilterCannotCarryScope(node: FilterNode): void {
  const stack: FilterNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    if (isBoundScope(current)) {
      throw new SearchError({
        code: "SEARCH_SCOPE_INVALID",
        message: "user filters cannot carry or negate a bound scope",
        details: { reason: "scope-in-user-filter" },
      });
    }
    if (current.op === "and" || current.op === "or") {
      stack.push(...current.children);
    } else if (current.op === "not") {
      stack.push(current.child);
    }
  }
}
