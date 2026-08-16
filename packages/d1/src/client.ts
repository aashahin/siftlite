/**
 * Minimal D1 binding surface used by the adapter.
 *
 * Compatible with `D1Database` and `D1DatabaseSession` from the Workers
 * runtime. Core never imports Cloudflare types.
 */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
}

export interface D1ResultMetaLike {
  readonly duration?: number;
  readonly rows_read?: number;
  readonly rows_written?: number;
  readonly changes?: number;
  readonly last_row_id?: number;
  readonly changed_db?: boolean;
  readonly served_by_region?: string;
  readonly served_by_primary?: boolean;
}

export interface D1ResultLike<T = Record<string, unknown>> {
  readonly results?: readonly T[];
  readonly success?: boolean;
  readonly meta?: D1ResultMetaLike;
  readonly error?: string;
}

export interface D1ExecutionTarget {
  prepare(query: string): D1PreparedLike;
  batch<T = Record<string, unknown>>(
    statements: readonly D1PreparedLike[],
  ): Promise<readonly D1ResultLike<T>[]>;
}

export interface D1DatabaseLike extends D1ExecutionTarget {
  withSession?(constraintOrBookmark?: string): D1SessionLike;
}

export interface D1SessionLike extends D1ExecutionTarget {
  getBookmark(): string | null;
}

export type D1SessionConstraint = "first-primary" | "first-unconstrained" | (string & {});
