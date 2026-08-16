/**
 * Backend-local native score metadata. Public API scores are always
 * higher-is-better after mapping and must not be compared across backends.
 */
export type NativeScoreDirection = "higher-is-better" | "lower-is-better";

export interface BackendScoreSemantics {
  readonly nativeDirection: NativeScoreDirection;
  readonly weightsPhysical: boolean;
  readonly highlight: boolean;
  readonly snippet: boolean;
}
