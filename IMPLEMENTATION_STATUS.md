# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

The ten public packages are published as `@siftlite/*@0.2.0`. Phases 0–13 are
implemented, including P12-06 always-merge ranking and local 100k/1m
characterization. Phase 14 evidence is in `docs/16-V1-RC.md`; npm RC publish
(P14-10) is owner-gated. D1 typo fallback stays off by default until remote
cost evidence exists. This is not a production-ready 1.0.

## Status

PASS for Phase 12/13/14 evidence work on this branch. npm `0.2.0` is the
current published baseline.

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
- P12-01 through P12-11 (P12-10 is the credentialed D1 harness + skip report)
- P13-01 through P13-12
- P14-01 through P14-09

## Remaining

- P14-10 — publish RC (owner-gated)
- Conditional Phase 15 — Turso-native graduation

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
- Fuzzy fallback always-merges behind exact/prefix hits, applies bound scope
  and request filters to candidate SQL, enforces `minGramOverlap` and
  `min(policy.maxCandidates, limits.maxFuzzyCandidates)`, batch-loads
  candidate text, and computes `hasMore`/`totalHits`/facets from the merged
  set. Highlighting is omitted on fuzzy hits with `highlight-unavailable-fuzzy`.
- CLI loads a host `siftlite.config.mjs` exporting `createAdapter` + `indexes`.
- Plain D1 `readReplicaEligible` is `false`; Sessions adapters set it `true`.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/libSQL credentials are unavailable in this environment.
- D1 export does not support databases containing FTS5 virtual tables.

## Blockers

- D1 fuzzy remains off by default until remote P12-10 cost evidence exists.
- Phase 14 RC npm publish stays owner-gated.

## Latest verification result

On 2026-08-21: `bun run verify` passed. `bun test` passed 292 tests in 60
files; `bun run test:d1` passed 7 Workers tests; `bun run check-exports`
passed for all ten packages. `bun audit` reported no vulnerabilities
(283 packages). Local 100k/1m reports are in `docs/benchmarks/`.
