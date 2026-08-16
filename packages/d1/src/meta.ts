import type { D1ResultMetaLike } from "./client.js";

/** Portable last-query metadata. Used by optional remote smoke/cost reporting. */
export interface D1QueryMeta {
  readonly durationMs?: number;
  readonly rowsRead?: number;
  readonly rowsWritten?: number;
  readonly rowsAffected?: number;
  readonly lastRowId?: number;
  readonly changedDb?: boolean;
  readonly servedByRegion?: string;
  readonly servedByPrimary?: boolean;
}

export function toD1QueryMeta(meta: D1ResultMetaLike | undefined): D1QueryMeta | undefined {
  if (!meta) {
    return undefined;
  }
  return {
    ...(meta.duration !== undefined ? { durationMs: meta.duration } : {}),
    ...(meta.rows_read !== undefined ? { rowsRead: meta.rows_read } : {}),
    ...(meta.rows_written !== undefined ? { rowsWritten: meta.rows_written } : {}),
    ...(meta.changes !== undefined ? { rowsAffected: meta.changes } : {}),
    ...(meta.last_row_id !== undefined ? { lastRowId: meta.last_row_id } : {}),
    ...(meta.changed_db !== undefined ? { changedDb: meta.changed_db } : {}),
    ...(meta.served_by_region !== undefined ? { servedByRegion: meta.served_by_region } : {}),
    ...(meta.served_by_primary !== undefined ? { servedByPrimary: meta.served_by_primary } : {}),
  };
}
