# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

Phase 7 — Cloudflare D1 adapter and Workers-runtime conformance

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
- P7-01 through P7-12

## Remaining

Phases 8–14 (libSQL, Arabic, ORMs, fuzzy, CLI, RC)
and conditional Phase 15.

## Tests executed

`bun run verify` including `bun run test:d1` (Workers Vitest / workerd)

## Significant implementation decisions

- `@siftlite/d1` wraps a minimal `D1Database`/`D1DatabaseSession` interface.
  Core does not import Cloudflare types.
- Documented D1 limits (2026-08-16): 100 binds, 32 function args, 100 KB
  statements, 50-byte LIKE patterns, 30s query duration.
- Plain D1 bindings are replica-eligible and not session-aware.
  `d1SessionAdapter` exposes `withSession` bookmarks and sequential consistency.
- Interactive transactions are unsupported (`batch` is the atomic unit).
- Typo fallback stays off via `D1_DEFAULT_SEARCH_POLICY` on this cost-sensitive
  runtime.
- D1 export still cannot dump virtual tables; drop FTS, export authoritative
  tables, then rebuild.
- Optional remote smoke (`bun run test:d1:smoke`) skips without credentials and
  checks the official D1 API when they are present.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/Turso credentials are unavailable in this environment.
- D1 export does not support databases containing FTS5 virtual tables.
- D1 Worker JS API does not support `BigInt` binds.

## Blockers

None for Phases 0–7.

## Latest verification result

`bun run verify` passed on 2026-08-16 after Phase 7 (97 bun tests + 4 Workers Vitest tests).
