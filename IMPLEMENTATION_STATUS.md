# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

The ten public packages are published as `@siftlite/*@0.2.0`. Phases 0–11 are
implemented. Phase 12 request-equivalent fuzzy semantics (P12-03/P12-04),
companion trigram SQL/integrity, facet typing, and Phase 13 operational CLI
shipped in `0.2.0`. Remote cost characterization (P12-08–10),
P12-06 always-merge ranking, and Phase 14 RC work remain open. This is not a
production-ready 1.0.

## Status

PASS for the Phase 12/13 completion work. npm `0.2.0` is the current
published baseline. Treat `0.1.0` as the previous release.

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
- P12-01 through P12-05, P12-07, P12-11 (P12-03/P12-04 closed on this branch)
- P13-01 through P13-12

## Remaining

- Phase 12 remote 100k/1m/D1 cost characterization (P12-08–10)
- P12-06 merge fuzzy behind exact/prefix groups (mode remains empty-exact
  fallback; deferred by design)
- Phase 14 — v1.0 RC hardening
- Conditional Phase 15

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
- Fuzzy fallback applies bound scope and request filters to candidate SQL,
  enforces `minGramOverlap` and `min(policy.maxCandidates, limits.maxFuzzyCandidates)`,
  batch-loads candidate text, and recomputes `hasMore`/`totalHits`/facets from
  fuzzy survivors. Highlighting is omitted with `highlight-unavailable-fuzzy`.
- CLI loads a host `siftlite.config.mjs` exporting `createAdapter` + `indexes`.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/libSQL credentials are unavailable in this environment.
- D1 export does not support databases containing FTS5 virtual tables.

## Blockers

- D1 fuzzy remains off by default until P12-08–10 cost evidence exists.
- Phase 14 RC and further npm publishes stay owner-gated.

## Latest verification result

On 2026-08-19 (branch `cursor/grok-4-6-subagents-workflows-e3a2`):
`bun run typecheck` and `bun run build` passed; `bun run check-exports` passed
for all ten packages; `bun test` passed 288 tests; `bun run test:d1` passed
7 Workers tests. Format check passed after biome format on new fuzzy tests.
