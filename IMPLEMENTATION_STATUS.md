# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

Phase 6 — Full application semantics

## Status

PASS

## Completed tasks

- P0-01 through P0-08
- P1-01 through P1-15
- P2-01 through P2-10
- P3-01 through P3-07
- P4-01 through P4-15
- P5-01 through P5-10
- P6-01 through P6-12

## Remaining

Phases 7–14 (D1, libSQL, Arabic, ORMs, fuzzy, CLI, RC)
and conditional Phase 15.

## Tests executed

`bun run verify`

## Significant implementation decisions

- Application search is `searchFts5Index` in `@siftlite/fts5`. Canonical hits
  are ID-first; hydration is an optional batched step.
- Filter compilation reserves search, pagination, and scope binds before
  expanding `IN`/`notIn` against the remaining proven runtime budget.
- Facets are conjunctive and exclude NULL buckets. Numeric `min`/`max` stats
  use the same candidate predicate as hits.
- Empty-query browsing omits MATCH, rejects relevance sort, and returns
  `score: null`.
- Synonym expansion is one-level and index-local. Bidirectional maps do not
  recurse. Exact totals run only when `includeTotal: true`.
- Highlight uses FTS5 `snippet()` with caller-selected markers and is not
  advertised as trusted HTML.
- Diagnostics omit SQL, bound values, and raw query text.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/Turso credentials are unavailable.
- Bun SQLite accepts `optimize` and `INSERT ... (fts, rank) VALUES ('merge', N)`
  but not `VALUES('merge=N')`.

## Blockers

None for Phases 0–6.

## Latest verification result

`bun run verify` passed on 2026-08-16 after Phase 6 (93 tests).
