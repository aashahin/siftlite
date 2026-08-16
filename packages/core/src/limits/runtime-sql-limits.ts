/**
 * Runtime SQL/resource limits.
 *
 * `undefined` means the limit is unproven, never unlimited.
 */
export interface RuntimeSqlLimits {
  readonly maxBindParameters?: number;
  readonly maxFunctionArguments?: number;
  readonly maxColumnsPerTable?: number;
  readonly maxStatementBytes?: number;
  readonly maxLikePatternBytes?: number;
  readonly maxQueryDurationMs?: number;
}

export type ProvenLimit = number | "unproven";

export function isUnprovenLimit(value: number | undefined): value is undefined {
  return value === undefined;
}

export function interpretLimit(value: number | undefined): ProvenLimit {
  return value === undefined ? "unproven" : value;
}

export function remainingOf(limit: number | undefined, used: number): ProvenLimit {
  if (limit === undefined) {
    return "unproven";
  }
  return limit - used;
}
