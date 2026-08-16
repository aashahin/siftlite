# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

Phase 10 — Drizzle integration

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
- P8-01 through P8-06
- P9-01 through P9-08
- P10-01 through P10-07

## Remaining

Phases 11–14 (Prisma, fuzzy, CLI, RC) and conditional Phase 15.

## Tests executed

`bun run verify`

## Significant implementation decisions

- `@siftlite/drizzle` is a companion. It maps public Drizzle 0.45 metadata
  (`getTableName`, `getTableColumns`, column `name`/`dataType`/`columnType`/
  timestamp `mode`) into canonical SiftLite codecs.
- Blob, bigint, and JSON columns fail at definition time. Timestamp units come
  from Drizzle's explicit `timestamp` / `timestamp_ms` modes only.
- Linked-mode field names are SQL column names so triggers bind `NEW."col"`.
- Synchronization remains trigger-owned; ORM and raw SQL writes are both tested
  on Bun and local libSQL.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/libSQL credentials are unavailable in this environment.
- D1 export does not support databases containing FTS5 virtual tables.
- Drizzle 0.45 stores bigint as `blob({ mode: "bigint" })`, not integer mode.
- A Drizzle client was not bundled into the D1 Workers test pool; D1 still runs
  shared FTS5/Arabic conformance, and trigger ownership is proven on Bun/libSQL.

## Blockers

None for Phases 0–10.

## Latest verification result

`bun run verify` passed after Phase 10 (format, lint, typecheck, build, 127 bun tests, 5 D1 Workers tests, export check).
