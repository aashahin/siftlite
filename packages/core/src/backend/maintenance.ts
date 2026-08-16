/**
 * Portable maintenance vocabulary. Backends map these onto native commands.
 * Full optimize is never assumed safe on remote runtimes.
 */
export type MaintenanceStrategy = "incremental" | "full";

export interface MaintenanceVisibility {
  readonly preCommitSearchVisible: boolean;
  readonly postCommitSearchVisible: boolean;
  readonly optimizeCommand: string;
  readonly incrementalMergeSupported: boolean;
}
