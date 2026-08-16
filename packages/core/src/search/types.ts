import type { FilterNode } from "../ast/filter.js";
import type { BoundScope } from "../ast/scope.js";
import type { PortableScalar } from "../ast/scalar.js";
import type { MatchingStrategy } from "../definition/types.js";
import type { SourceId } from "../ids/source-id.js";
import type { SearchSort } from "../backend/search-backend.js";

/** Opt-in diagnostic warning. Must not include secrets or bound values. */
export interface SearchWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * Application search request. Ordinary `query` text is parsed separately and
 * never treated as backend grammar.
 */
export interface SearchRequest {
  readonly filter?: FilterNode;
  readonly sort?: readonly SearchSort[];
  readonly facets?: readonly string[];
  readonly highlight?: readonly string[];
  readonly highlightMarkers?: HighlightMarkers;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeTotal?: boolean;
  readonly hydrate?: boolean;
  readonly diagnostics?: boolean;
  readonly matchingStrategy?: MatchingStrategy;
  readonly scope?: BoundScope;
  readonly signal?: AbortSignal;
}

/** Caller-selected snippet markers. Formatted text is not trusted HTML. */
export interface HighlightMarkers {
  readonly start: string;
  readonly end: string;
  readonly ellipsis: string;
}

export interface SearchPage {
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface SearchHit<TDocument = unknown> {
  readonly id: SourceId;
  readonly score: number | null;
  readonly document?: TDocument;
  readonly formatted?: Readonly<Record<string, string>>;
}

export interface FacetBucket {
  readonly value: PortableScalar;
  readonly count: number;
}

export type FacetDistribution = readonly FacetBucket[];

export interface FacetStats {
  readonly min: number;
  readonly max: number;
}

/**
 * Opt-in diagnostics. Production payloads must not include SQL, bound values,
 * or raw user content.
 */
export interface SearchDiagnostics {
  readonly backend: string;
  readonly runtime: string;
  readonly fuzzyUsed: boolean;
  readonly bindParametersUsed?: number;
  readonly warnings?: readonly SearchWarning[];
}

export interface SearchResponse<TDocument = unknown> {
  readonly hits: readonly SearchHit<TDocument>[];
  readonly page: SearchPage;
  readonly totalHits?: number;
  readonly estimatedTotalHits?: number;
  readonly facets?: Readonly<Record<string, FacetDistribution>>;
  readonly facetStats?: Readonly<Record<string, FacetStats>>;
  readonly query: string;
  readonly processingTimeMs?: number;
  readonly backend: string;
  readonly warnings?: readonly SearchWarning[];
  readonly meta?: SearchDiagnostics;
}

/**
 * Rank-preserving hydrator. Implementations must batch IDs and never issue
 * one query per hit.
 */
export interface DocumentHydrator<TDocument = unknown> {
  hydrate(ids: readonly SourceId[]): Promise<ReadonlyMap<SourceId, TDocument>>;
}

/**
 * Web AbortSignal. Declared here so portable core can name the cancellation
 * API without compiling against the DOM lib.
 */
declare global {
  interface AbortSignal {
    readonly aborted: boolean;
  }
}
