import { SearchError } from "../errors/search-error.js";

/**
 * Portable v1 source identifier.
 *
 * Numeric IDs must be finite safe integers. String IDs preserve exact text,
 * including leading zeroes. `"123"` and `123` are distinct contracts.
 */
export type SourceId = string | number;

export type SourceIdKind = "string" | "safe-integer";

export function isSafeIntegerSourceId(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function isSourceId(value: unknown): value is SourceId {
  if (typeof value === "string") {
    return true;
  }
  return typeof value === "number" && isSafeIntegerSourceId(value);
}

export function sourceIdKind(value: SourceId): SourceIdKind {
  return typeof value === "string" ? "string" : "safe-integer";
}

/**
 * Exact identity comparison. String `"123"` is never equal to numeric `123`.
 */
export function sourceIdsEqual(left: SourceId, right: SourceId): boolean {
  return sourceIdKind(left) === sourceIdKind(right) && left === right;
}

export function assertSourceId(value: unknown, field = "id"): SourceId {
  if (typeof value === "bigint") {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: `${field} rejects bigint; portable v1 source IDs are string or safe integer`,
      details: { field, reason: "bigint" },
    });
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      throw new SearchError({
        code: "SEARCH_VALUE_INVALID",
        message: `${field} rejects NaN`,
        details: { field, reason: "nan" },
      });
    }
    if (!Number.isFinite(value)) {
      throw new SearchError({
        code: "SEARCH_VALUE_INVALID",
        message: `${field} rejects Infinity`,
        details: { field, reason: "infinity" },
      });
    }
    if (!isSafeIntegerSourceId(value)) {
      throw new SearchError({
        code: "SEARCH_VALUE_INVALID",
        message: `${field} rejects unsafe integers`,
        details: { field, reason: "unsafe-integer" },
      });
    }
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new SearchError({
    code: "SEARCH_VALUE_INVALID",
    message: `${field} must be a string or finite safe integer`,
    details: { field, reason: "unsupported-type" },
  });
}
