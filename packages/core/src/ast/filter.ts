import { SearchError } from "../errors/search-error.js";
import { assertPortableScalar, type PortableScalar } from "./scalar.js";

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type MembershipOperator = "in" | "notIn";
export type NullOperator = "isNull" | "isNotNull";
export type BooleanOperator = "and" | "or";

export type FilterNode<TField extends string = string> =
  | { readonly op: ComparisonOperator; readonly field: TField; readonly value: PortableScalar }
  | {
      readonly op: MembershipOperator;
      readonly field: TField;
      readonly values: readonly PortableScalar[];
    }
  | { readonly op: NullOperator; readonly field: TField }
  | { readonly op: BooleanOperator; readonly children: readonly FilterNode<TField>[] }
  | { readonly op: "not"; readonly child: FilterNode<TField> };

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

export function eq<TField extends string>(field: TField, value: unknown): FilterNode<TField> {
  return { op: "eq", field, value: assertPortableScalar(value, field) };
}

export function neq<TField extends string>(field: TField, value: unknown): FilterNode<TField> {
  return { op: "neq", field, value: assertPortableScalar(value, field) };
}

export function gt<TField extends string>(field: TField, value: unknown): FilterNode<TField> {
  return { op: "gt", field, value: assertPortableScalar(value, field) };
}

export function gte<TField extends string>(field: TField, value: unknown): FilterNode<TField> {
  return { op: "gte", field, value: assertPortableScalar(value, field) };
}

export function lt<TField extends string>(field: TField, value: unknown): FilterNode<TField> {
  return { op: "lt", field, value: assertPortableScalar(value, field) };
}

export function lte<TField extends string>(field: TField, value: unknown): FilterNode<TField> {
  return { op: "lte", field, value: assertPortableScalar(value, field) };
}

export function inList<TField extends string>(
  field: TField,
  values: readonly unknown[],
): FilterNode<TField> {
  return { op: "in", field, values: assertMembershipValues(field, values) };
}

export function notIn<TField extends string>(
  field: TField,
  values: readonly unknown[],
): FilterNode<TField> {
  return { op: "notIn", field, values: assertMembershipValues(field, values) };
}

export function isNull<TField extends string>(field: TField): FilterNode<TField> {
  return { op: "isNull", field };
}

export function isNotNull<TField extends string>(field: TField): FilterNode<TField> {
  return { op: "isNotNull", field };
}

export function and<TField extends string>(
  ...children: readonly FilterNode<TField>[]
): FilterNode<TField> {
  assertBooleanChildren("and", children);
  return { op: "and", children };
}

export function or<TField extends string>(
  ...children: readonly FilterNode<TField>[]
): FilterNode<TField> {
  assertBooleanChildren("or", children);
  return { op: "or", children };
}

export function not<TField extends string>(child: FilterNode<TField>): FilterNode<TField> {
  if (!isFilterNode(child)) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: "not() accepts only a user filter node",
      details: { reason: "invalid-not-child" },
    });
  }
  return { op: "not", child };
}

export function between<TField extends string>(
  field: TField,
  min: unknown,
  max: unknown,
): FilterNode<TField> {
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
