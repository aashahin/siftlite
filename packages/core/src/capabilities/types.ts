import type { RuntimeSqlLimits } from "../limits/runtime-sql-limits.js";

export interface SearchCapabilities {
  readonly fullText: boolean;
  readonly phrase: boolean;
  readonly prefix: boolean;
  readonly weightedRanking: boolean;
  readonly highlight: boolean;
  readonly snippet: boolean;
  readonly filters: boolean;
  readonly sort: boolean;
  readonly facets: boolean;
  readonly typoFallback: boolean;
  readonly vocabulary: boolean;
  readonly nativeVector: boolean;
  readonly cancellation: boolean;
}

export interface ReadConsistencyCapabilities {
  readonly transactionReadYourWrites: boolean;
  readonly postCommitReadYourWrites: boolean;
  readonly sessionAware: boolean;
  readonly sequentialSessionConsistency: boolean;
  readonly readReplicaEligible: boolean;
}

export interface RuntimeCapabilities {
  readonly id: string;
  readonly dialect: "sqlite";
  readonly limits: RuntimeSqlLimits;
  readonly consistency: ReadConsistencyCapabilities;
  readonly transactions: boolean;
  readonly batch: boolean;
  readonly cancellation: boolean;
  readonly costSensitive?: boolean;
}

export interface RuntimeProbeResult {
  readonly fts5?: boolean;
  readonly trigramTokenizer?: boolean;
  readonly fts5SecureDelete?: boolean;
  readonly fts5Vocab?: boolean;
  readonly nativeFts?: boolean;
  readonly warnings?: readonly CapabilityWarning[];
}

export type TypoFallbackPolicy = "enabled" | "disabled" | "disabled-on-cost-sensitive-runtimes";

export interface SearchPolicy {
  readonly typoFallback: TypoFallbackPolicy;
  readonly costSensitive?: boolean;
}

export interface CapabilityWarning {
  readonly code: string;
  readonly message: string;
}

export interface CapabilityResolutionContext {
  readonly backend: SearchCapabilities;
  readonly runtime: RuntimeCapabilities;
  readonly probes: RuntimeProbeResult;
  readonly policy: SearchPolicy;
}

export interface EffectiveCapabilities {
  readonly features: SearchCapabilities;
  readonly limits: RuntimeSqlLimits;
  readonly consistency: ReadConsistencyCapabilities;
  readonly warnings: readonly CapabilityWarning[];
}

export const DISABLED_SEARCH_CAPABILITIES: SearchCapabilities = {
  fullText: false,
  phrase: false,
  prefix: false,
  weightedRanking: false,
  highlight: false,
  snippet: false,
  filters: false,
  sort: false,
  facets: false,
  typoFallback: false,
  vocabulary: false,
  nativeVector: false,
  cancellation: false,
};
