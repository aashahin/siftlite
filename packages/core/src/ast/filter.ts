import { SearchError } from "../errors/search-error.js";
import { assertPortableScalar, type PortableScalar } from "./scalar.js";

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type MembershipOperator = "in" | "notIn";
export type NullOperator = "isNull" | "isNotNull";
export type BooleanOperator = "and" | "or";

export type FilterNode =
  | { readonly op: ComparisonOperator; readonly field: string; readonly value: PortableScalar }
  | {
      readonly op: MembershipOperator;
      readonly field: string;
      readonly values: readonly PortableScalar[];
    }
  | { readonly op: NullOperator; readonly field: string }
  | { readonly op: BooleanOperator; readonly children: readonly FilterNode[] }
  | { readonly op: "not"; readonly child: FilterNode };

const FILTER_OPS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "and",
  "or",
  "not",
]);

export function isFilterNode(value: unknown): value is FilterNode {
  if (value === null || typeof value !== "object" || !("op" in value)) {
    return false;
  }
  const op = (value as { op: unknown }).op;
  return typeof op === "string" && FILTER_OPS.has(op);
}

export function eq(field: string, value: unknown): FilterNode {
  return { op: "eq", field, value: assertPortableScalar(value, field) };
}

export function neq(field: string, value: unknown): FilterNode {
  return { op: "neq", field, value: assertPortableScalar(value, field) };
}

export function gt(field: string, value: unknown): FilterNode {
  return { op: "gt", field, value: assertPortableScalar(value, field) };
}

export function gte(field: string, value: unknown): FilterNode {
  return { op: "gte", field, value: assertPortableScalar(value, field) };
}

export function lt(field: string, value: unknown): FilterNode {
  return { op: "lt", field, value: assertPortableScalar(value, field) };
}

export function lte(field: string, value: unknown): FilterNode {
  return { op: "lte", field, value: assertPortableScalar(value, field) };
}

export function inList(field: string, values: readonly unknown[]): FilterNode {
  return { op: "in", field, values: assertMembershipValues(field, values) };
}

export function notIn(field: string, values: readonly unknown[]): FilterNode {
  return { op: "notIn", field, values: assertMembershipValues(field, values) };
}

export function isNull(field: string): FilterNode {
  return { op: "isNull", field };
}

export function isNotNull(field: string): FilterNode {
  return { op: "isNotNull", field };
}

export function and(...children: readonly FilterNode[]): FilterNode {
  assertBooleanChildren("and", children);
  return { op: "and", children };
}

export function or(...children: readonly FilterNode[]): FilterNode {
  assertBooleanChildren("or", children);
  return { op: "or", children };
}

export function not(child: FilterNode): FilterNode {
  if (!isFilterNode(child)) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: "not() accepts only a user filter node",
      details: { reason: "invalid-not-child" },
    });
  }
  return { op: "not", child };
}

export function between(field: string, min: unknown, max: unknown): FilterNode {
  return and(gte(field, min), lte(field, max));
}

function assertMembershipValues(
  field: string,
  values: readonly unknown[],
): readonly PortableScalar[] {
  if (values.length === 0) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: `${field} rejects empty IN/NOT IN lists`,
      details: { reason: "empty-in" },
    });
  }
  return values.map((value, index) => {
    if (value === null) {
      throw new SearchError({
        code: "SEARCH_FILTER_INVALID",
        message: `${field} rejects NULL in IN/NOT IN; use isNull`,
        details: { reason: "null-in", index },
      });
    }
    return assertPortableScalar(value, field);
  });
}

function assertBooleanChildren(op: BooleanOperator, children: readonly FilterNode[]): void {
  if (children.length === 0) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: `${op} requires at least one child filter`,
      details: { reason: "empty-boolean" },
    });
  }
  for (const child of children) {
    if (!isFilterNode(child)) {
      throw new SearchError({
        code: "SEARCH_FILTER_INVALID",
        message: `${op} children must be user filter nodes`,
        details: { reason: "invalid-boolean-child" },
      });
    }
  }
}
