/**
 * Opt-in search observability. Events must not include raw query text or
 * bound values.
 */
export interface SearchHooks {
  onSearch?(event: {
    readonly indexName: string;
    readonly backend: string;
    readonly durationMs: number;
    readonly resultCount: number;
    readonly filterCount: number;
    readonly facetCount: number;
    readonly fuzzyUsed: boolean;
  }): void;
}
