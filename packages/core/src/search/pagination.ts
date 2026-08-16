import { SearchError } from "../errors/search-error.js";
import type { ApplicationLimits } from "../limits/application-limits.js";

export interface ResolvedSearchPage {
  readonly limit: number;
  readonly offset: number;
}

export function resolveSearchPage(
  request: { readonly limit?: number; readonly offset?: number },
  limits: ApplicationLimits,
): ResolvedSearchPage {
  const limit = request.limit ?? limits.defaultLimit;
  const offset = request.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > limits.maxLimit) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "limit is outside the configured application range",
      details: { reason: "limit", limit, maxLimit: limits.maxLimit },
    });
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > limits.maxOffset) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "offset is outside the configured application range",
      details: { reason: "offset", offset, maxOffset: limits.maxOffset },
    });
  }
  return { limit, offset };
}
