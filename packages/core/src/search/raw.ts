import { SearchError } from "../errors/search-error.js";

export type RawSearchBackend = "fts5";

export interface UnsafeBackendQuery {
  readonly kind: "unsafe-backend-query";
  readonly backend: RawSearchBackend;
  readonly value: string;
}

export function unsafeFts5Query(value: string): UnsafeBackendQuery {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000")) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "raw backend query must be a non-empty string without NUL bytes",
      details: { reason: "invalid-raw-query" },
    });
  }
  return { kind: "unsafe-backend-query", backend: "fts5", value };
}

export function isUnsafeFts5Query(value: unknown): value is UnsafeBackendQuery {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "unsafe-backend-query" &&
    (value as { backend?: unknown }).backend === "fts5" &&
    typeof (value as { value?: unknown }).value === "string"
  );
}
