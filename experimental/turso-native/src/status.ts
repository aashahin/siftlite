/**
 * Upstream status recorded for Phase 3. Re-check before any graduation.
 *
 * Official docs at the v1.2 review still show experimental index-method FTS:
 * `experimental: ["index_method"]`.
 */
export const TURSO_NATIVE_UPSTREAM_STATUS = {
  packageLabel: "experimental",
  requiredUpstreamFlag: "index_method",
  remoteTestsAvailable: false,
  remoteTestsReason: "no Turso Database credentials in this environment",
  syntax: {
    ddl: "CREATE INDEX ... USING fts",
    match: "fts_match",
    score: "fts_score",
    highlight: "fts_highlight",
    maintain: "OPTIMIZE INDEX",
  },
} as const;
