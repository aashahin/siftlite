import { SearchError } from "../errors/search-error.js";

export interface FuzzyCandidatePolicy {
  readonly minTokenCodepoints: number;
  readonly maxQueryTokens: number;
  readonly maxTrigramsPerToken: number;
  readonly minGramOverlap: number;
  readonly maxCandidates: number;
  readonly maxEditDistance: number;
}

export const DEFAULT_FUZZY_POLICY: FuzzyCandidatePolicy = {
  minTokenCodepoints: 3,
  maxQueryTokens: 4,
  maxTrigramsPerToken: 24,
  minGramOverlap: 1,
  maxCandidates: 200,
  maxEditDistance: 2,
};

export function validateFuzzyCandidatePolicy(policy: FuzzyCandidatePolicy): FuzzyCandidatePolicy {
  const entries = Object.entries(policy) as Array<[keyof FuzzyCandidatePolicy, number]>;
  for (const [key, value] of entries) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `fuzzy policy ${key} must be a non-negative safe integer`,
        details: { reason: "invalid-fuzzy-policy" },
      });
    }
  }
  if (policy.minTokenCodepoints < 3) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "fuzzy minTokenCodepoints must be at least 3",
      details: { reason: "invalid-fuzzy-policy" },
    });
  }
  if (policy.maxCandidates < 1 || policy.maxQueryTokens < 1) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "fuzzy maxCandidates and maxQueryTokens must be at least 1",
      details: { reason: "invalid-fuzzy-policy" },
    });
  }
  return policy;
}
