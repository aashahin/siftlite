import { SearchError } from "../errors/search-error.js";

export interface ApplicationLimits {
  readonly maxQueryLength: number;
  readonly maxTerms: number;
  readonly maxLimit: number;
  readonly defaultLimit: number;
  readonly maxOffset: number;
  readonly maxFacets: number;
  readonly maxFacetValues: number;
  readonly maxFilterDepth: number;
  readonly maxFilterNodes: number;
  readonly maxInValues: number;
  readonly maxSynonymExpansion: number;
  readonly maxFuzzyCandidates: number;
}

export const DEFAULT_APPLICATION_LIMITS: ApplicationLimits = {
  maxQueryLength: 512,
  maxTerms: 32,
  maxLimit: 100,
  defaultLimit: 20,
  maxOffset: 10_000,
  maxFacets: 10,
  maxFacetValues: 100,
  maxFilterDepth: 8,
  maxFilterNodes: 64,
  maxInValues: 100,
  maxSynonymExpansion: 64,
  maxFuzzyCandidates: 200,
};

export function validateApplicationLimits(limits: ApplicationLimits): ApplicationLimits {
  const entries = Object.entries(limits) as Array<[keyof ApplicationLimits, number]>;
  for (const [key, value] of entries) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `application limit ${key} must be a non-negative safe integer`,
        details: { reason: "invalid-application-limit" },
      });
    }
  }
  if (limits.defaultLimit > limits.maxLimit) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "defaultLimit cannot exceed maxLimit",
      details: { reason: "default-limit" },
    });
  }
  return limits;
}
