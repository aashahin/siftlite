import { assertFieldName } from "../definition/identifiers.js";
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

export function isScopePredicate(value: unknown): value is ScopePredicate {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const predicate = value as { kind?: unknown; field?: unknown; value?: unknown };
  return (
    predicate.kind === "scope-eq" &&
    typeof predicate.field === "string" &&
    predicate.field.length > 0 &&
    isPortableScopeValue(predicate.value)
  );
}

export function isBoundScope(value: unknown): value is BoundScope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "bound-scope" &&
    Array.isArray((value as { predicates?: unknown }).predicates) &&
    (value as BoundScope).predicates.every(isScopePredicate)
  );
}

export function assertBoundScope(value: unknown): BoundScope {
  if (!isBoundScope(value)) {
    throw new SearchError({
      code: "SEARCH_SCOPE_INVALID",
      message: "value is not a bound scope",
      details: { reason: "missing-scope" },
    });
  }
  if (value.predicates.length === 0) {
    throw new SearchError({
      code: "SEARCH_SCOPE_INVALID",
      message: "scope requires at least one predicate",
      details: { reason: "empty-scope" },
    });
  }
  for (const predicate of value.predicates) {
    assertScopeField(predicate.field);
  }
  return value;
}

export function bindScope(values: Readonly<Record<string, unknown>>): BoundScope {
  const predicates = Object.entries(values).map(([field, value]) => {
    assertScopeField(field);
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
  assertBoundScope(scope);
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
  const stack: Array<FilterNode | BoundScope> = [node];
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
      if (!Array.isArray(current.children)) {
        throw new SearchError({
          code: "SEARCH_FILTER_INVALID",
          message: "boolean filter children must be an array",
          details: { reason: "invalid-boolean-child" },
        });
      }
      for (const child of current.children) {
        if (!isFilterNode(child) && !isBoundScope(child)) {
          throw new SearchError({
            code: "SEARCH_FILTER_INVALID",
            message: "boolean filter children must be user filter nodes",
            details: { reason: "invalid-boolean-child" },
          });
        }
        stack.push(child);
      }
    } else if (current.op === "not") {
      if (!isFilterNode(current.child) && !isBoundScope(current.child)) {
        throw new SearchError({
          code: "SEARCH_FILTER_INVALID",
          message: "not() accepts only a user filter node",
          details: { reason: "invalid-not-child" },
        });
      }
      stack.push(current.child);
    }
  }
}

function assertScopeField(field: string): void {
  if (typeof field !== "string" || field.length === 0) {
    throw new SearchError({
      code: "SEARCH_SCOPE_INVALID",
      message: "scope field names must be non-empty",
      details: { reason: "empty-field" },
    });
  }
  try {
    assertFieldName(field, "scope");
  } catch {
    throw new SearchError({
      code: "SEARCH_SCOPE_INVALID",
      message: "scope field name is not a conservative identifier",
      details: { reason: "invalid-field" },
    });
  }
}

function isPortableScopeValue(value: unknown): value is PortableScalar {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
