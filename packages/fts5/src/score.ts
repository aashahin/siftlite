/**
 * SQLite FTS5 BM25 is lower-is-better. Public scores are higher-is-better and
 * backend-local. The mapping is monotonic and must not be compared across backends.
 */
export function publicScoreFromFts5Bm25(rank: number): number {
  return -rank;
}
