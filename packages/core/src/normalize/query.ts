import { parsePlainTextQuery, type ParseQueryOptions } from "../parser/parse-query.js";
import type { TextQuery } from "../ast/text-query.js";
import { SearchError } from "../errors/search-error.js";
import { codePointLength } from "../parser/unicode.js";
import { normalizeIndexText } from "./apply.js";

export interface ParseIndexQueryOptions extends ParseQueryOptions {
  readonly normalization?: readonly string[];
}

/**
 * Application search path: validate raw bounds, apply index-level
 * normalization once, then parse portable query intent.
 */
export function parseIndexTextQuery(input: string, options: ParseIndexQueryOptions): TextQuery {
  if (input.includes("\u0000")) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "query rejects NUL bytes",
      details: { reason: "nul-byte" },
    });
  }
  if (codePointLength(input) > options.limits.maxQueryLength) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "query exceeds maxQueryLength",
      details: { reason: "max-query-length", length: codePointLength(input) },
    });
  }
  const normalized = normalizeIndexText(input, options.normalization ?? []);
  return parsePlainTextQuery(normalized, options);
}
