import { SearchError } from "../errors/search-error.js";

/** Values adapters may bind on the portable path. */
export type PortableBindValue = null | string | number | boolean | Uint8Array;

function rejectBind(reason: string, message: string): never {
  throw new SearchError({
    code: "SEARCH_VALUE_INVALID",
    message,
    details: { reason },
  });
}

/** Reject values that adapters must not bind on the portable path. */
export function assertBindValue(value: unknown): PortableBindValue {
  if (value === null) {
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      rejectBind("non-finite-number", "adapters reject NaN and Infinity binds");
    }
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === "bigint") {
    rejectBind("bigint", "adapters reject bigint binds on the portable path");
  }
  if (value === undefined) {
    rejectBind("undefined", "adapters reject undefined binds");
  }
  if (Array.isArray(value)) {
    rejectBind("array", "adapters reject array binds");
  }
  if (typeof value === "symbol" || typeof value === "function") {
    rejectBind("unsupported-type", "adapters reject unsupported bind value types");
  }
  rejectBind("object", "adapters reject object binds on the portable path");
}

export function assertBindValues(values: readonly unknown[]): readonly PortableBindValue[] {
  return values.map((value) => assertBindValue(value));
}
