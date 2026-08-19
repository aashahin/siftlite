# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

The ten public packages are published as `@siftlite/*@0.1.0`. Phases 0–11
are substantially implemented. Phase 12 typo fallback and Phase 13 CLI are
partial; Phase 14 RC work has not started. This is not a production-ready 1.0.

## Status

PASS for the published package/build/test baseline. Do not treat Phase 12 or
Phase 13 as complete: the code/docs reconciliation in
`docs/15-CODE-DOCS-AUDIT.md` records correctness and coverage gaps.

## Completed tasks

- P0-01 through P0-08
- P1-01 through P1-15
- P2-01 through P2-10
- P3-01 through P3-07
- P4-01 through P4-15
- P5-01 through P5-10
- P6-01 through P6-12
- P7-01 through P7-12
- P8-01 through P8-06
- P9-01 through P9-08
- P10-01 through P10-07
- P11-01 through P11-06
- P12-01, P12-02, P12-05, P12-07, P12-11
- P13-03

## Remaining

- Phase 12 request-equivalent fuzzy semantics: scope, filters, sorting,
  pagination metadata, facets/totals/highlighting, overlap threshold, and
  configurable candidate limit
- Phase 12 remote 100k/1m/D1 cost characterization (P12-08–10)
- Companion-SQL trigram DDL and integrity coverage for fallback definitions
- Typed sortable-only facet support, or a narrower definition contract
- Phase 13 operational CLI and adapter/config loading
- Phase 14 — v1.0 RC hardening
- Conditional Phase 15

0.x publish blockers from the audit (LICENSE in packed files, `prepack`,
changeset ignore/fixed groups, `tsBuildInfoFile` outside `dist`, export
checks, example versions, executable examples) are closed. `@siftlite/*@0.1.0`
is on npm.

## Tests executed

See the latest verification result below. Historical test statements should
not be treated as current evidence.

## Significant implementation decisions

- `@siftlite/prisma` accepts a minimal `PrismaClientLike` (`findMany` with
  `{ id: { in } }`). `@prisma/client` is an optional peer and never enters core.
- Client Extensions are ergonomic wrappers around `createPrismaSearch`. They
  are not write hooks and are not required for correctness.
- Companion SQL is a deterministic subsequent migration fragment. Previously
  applied Prisma migrations are never rewritten.
- Supported client family is Prisma 6. No FTS model is required.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/libSQL credentials are unavailable in this environment.
- D1 export does not support databases containing FTS5 virtual tables.

## Blockers

- Do not enable typo fallback on tenant-scoped or authorization-filtered
  searches until candidate retrieval preserves request scope and filters.
- Do not use generated companion SQL for fallback-enabled definitions in
  `0.1.0`; it omits the trigram table and integrity checks do not detect that.
- Phase 13 operational CLI commands are placeholders, not database operations.

## Latest verification result

On 2026-08-19, npm returned `0.1.0` for
`@siftlite/{core,fts5,bun,node,testing,d1,libsql,drizzle,prisma,cli}` and
`siftlite version` reported `0.1.0`. The main suite passed 261 tests, the D1
worker suite passed 7 tests, all ten export checks passed, and the documentation
site built 34 pages with zero Nimbus diagnostics. Full details, including the
sandbox-only D1 listener failure in the initial combined run, are recorded in
`docs/15-CODE-DOCS-AUDIT.md`.
