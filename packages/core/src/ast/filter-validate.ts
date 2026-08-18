import type { IndexDefinition } from "../definition/types.js";
import { isSearchError, SearchError } from "../errors/search-error.js";
import type { ApplicationLimits } from "../limits/application-limits.js";
import {
  booleanIntegerCodec,
  finiteRealCodec,
  safeIntegerCodec,
  textCodec,
} from "../codecs/codecs.js";
import { timestampIntegerCodec } from "../codecs/timestamp.js";
import { assertFieldName, hasOwnField } from "../definition/identifiers.js";
import type { FilterNode } from "./filter.js";
import { isFilterNode } from "./filter.js";
import { assertPortableScalar, type PortableScalar } from "./scalar.js";

export interface FilterValidationOptions {
  readonly limits: ApplicationLimits;
  readonly definition?: IndexDefinition;
}

export function validateFilter(node: FilterNode, options: FilterValidationOptions): void {
  if (!isFilterNode(node)) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: "value is not a user filter node",
      details: { reason: "not-filter-node" },
    });
  }
  const stats = { nodes: 0, depth: 0 };
  walk(node, options, 1, stats);
}

function walk(
  node: FilterNode,
  options: FilterValidationOptions,
  depth: number,
  stats: { nodes: number; depth: number },
): void {
  if (!isFilterNode(node)) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: "value is not a user filter node",
      details: { reason: "not-filter-node" },
    });
  }
  stats.nodes += 1;
  stats.depth = Math.max(stats.depth, depth);
  if (stats.nodes > options.limits.maxFilterNodes) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "filter exceeds maxFilterNodes",
      details: { reason: "max-filter-nodes", nodes: stats.nodes },
    });
  }
  if (depth > options.limits.maxFilterDepth) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "filter exceeds maxFilterDepth",
      details: { reason: "max-filter-depth", depth },
    });
  }

  switch (node.op) {
    case "and":
    case "or":
      if (!Array.isArray(node.children) || node.children.length === 0) {
        throw new SearchError({
          code: "SEARCH_FILTER_INVALID",
          message: `${node.op} requires a non-empty child filter list`,
          details: { reason: "empty-boolean" },
        });
      }
      for (const child of node.children) {
        walk(child, options, depth + 1, stats);
      }
      return;
    case "not":
      walk(node.child, options, depth + 1, stats);
      return;
    case "isNull":
    case "isNotNull":
      assertFilterField(node.field);
      assertDeclaredField(node.field, options.definition);
      return;
    case "in":
    case "notIn":
      assertFilterField(node.field);
      if (!Array.isArray(node.values) || node.values.length === 0) {
        throw new SearchError({
          code: "SEARCH_FILTER_INVALID",
          message: `${node.field} rejects empty IN/NOT IN lists`,
          details: { reason: "empty-in" },
        });
      }
      if (node.values.length > options.limits.maxInValues) {
        throw new SearchError({
          code: "SEARCH_QUERY_LIMIT_EXCEEDED",
          message: "IN list exceeds application maxInValues",
          details: { reason: "max-in-values", count: node.values.length },
        });
      }
      for (const value of node.values) {
        assertFieldValue(node.field, value, options.definition);
      }
      return;
    default:
      assertFilterField(node.field);
      assertFieldValue(node.field, node.value, options.definition);
  }
}

function assertFilterField(field: unknown): asserts field is string {
  if (typeof field !== "string") {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: "filter field names must be strings",
      details: { reason: "invalid-field" },
    });
  }
  try {
    assertFieldName(field, "filter");
  } catch (error) {
    if (!isSearchError(error)) {
      throw error;
    }
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: "filter field name is not a conservative identifier",
      details: { reason: "invalid-field" },
    });
  }
}

function assertDeclaredField(field: string, definition: IndexDefinition | undefined): void {
  if (!definition) {
    return;
  }
  if (!hasOwnField(definition.filterable, field)) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: `field ${field} is not declared filterable`,
      details: { reason: "undeclared-field" },
    });
  }
}

function assertFieldValue(
  field: string,
  value: PortableScalar,
  definition: IndexDefinition | undefined,
): void {
  if (!definition) {
    assertPortableScalar(value, field);
    return;
  }
  if (!hasOwnField(definition.filterable, field)) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: `field ${field} is not declared filterable`,
      details: { reason: "undeclared-field" },
    });
  }
  const spec = definition.filterable[field];
  if (!spec) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: `field ${field} is not declared filterable`,
      details: { reason: "undeclared-field" },
    });
  }
  switch (spec.storageKind) {
    case "text":
      textCodec.encode(value as string);
      return;
    case "safe-integer":
      safeIntegerCodec.encode(value as number);
      return;
    case "finite-real":
      finiteRealCodec.encode(value as number);
      return;
    case "boolean-integer":
      booleanIntegerCodec.encode(value as boolean);
      return;
    case "timestamp-integer":
      timestampIntegerCodec(spec.timestampUnit ?? "unix-milliseconds").encode(value as number);
  }
}
