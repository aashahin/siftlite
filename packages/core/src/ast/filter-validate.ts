import type { IndexDefinition } from "../definition/types.js";
import { SearchError } from "../errors/search-error.js";
import type { ApplicationLimits } from "../limits/application-limits.js";
import {
  booleanIntegerCodec,
  finiteRealCodec,
  safeIntegerCodec,
  textCodec,
} from "../codecs/codecs.js";
import { timestampIntegerCodec } from "../codecs/timestamp.js";
import type { FilterNode } from "./filter.js";
import { isFilterNode } from "./filter.js";
import type { PortableScalar } from "./scalar.js";

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
  if (stats.nodes > options.limits.maxFilterNodes) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "filter exceeds maxFilterNodes",
      details: { reason: "max-filter-nodes", nodes: stats.nodes },
    });
  }
}

function walk(
  node: FilterNode,
  options: FilterValidationOptions,
  depth: number,
  stats: { nodes: number; depth: number },
): void {
  stats.nodes += 1;
  stats.depth = Math.max(stats.depth, depth);
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
      for (const child of node.children) {
        walk(child, options, depth + 1, stats);
      }
      return;
    case "not":
      walk(node.child, options, depth + 1, stats);
      return;
    case "isNull":
    case "isNotNull":
      assertDeclaredField(node.field, options.definition);
      return;
    case "in":
    case "notIn":
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
      assertFieldValue(node.field, node.value, options.definition);
  }
}

function assertDeclaredField(field: string, definition: IndexDefinition | undefined): void {
  if (!definition) {
    return;
  }
  if (!(field in definition.filterable)) {
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
    return;
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
