import { SearchError } from "../errors/search-error.js";

/** Reject values that adapters must not bind on the portable path. */
export function assertBindValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "adapters reject bigint binds on the portable path",
      details: { reason: "bigint" },
    });
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "adapters reject NaN and Infinity binds",
      details: { reason: "non-finite-number" },
    });
  }
  return value;
}

export function assertBindValues(values: readonly unknown[]): readonly unknown[] {
  return values.map((value) => assertBindValue(value));
}
