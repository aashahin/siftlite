# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

Phase 2 — FTS5 proof on Bun

## Status

PASS

## Completed tasks

- P0-01 through P0-08
- P1-01 through P1-15
- P2-01 through P2-10

## Tests executed

```bash
bun run verify
```

Results:

- format/check: pass
- lint: pass
- typecheck: pass
- unit/conformance: 55 passed / 0 failed
- build: pass
- export checks: pass

## Significant implementation decisions

- Bun adapter wraps sync `bun:sqlite` in the async `SqlAdapter` contract and rejects bigint binds.
- FTS5 MATCH is a single bound parameter produced from the portable AST.
- Public FTS5 scores are `-bm25` so higher is better; scores remain backend-local.
- FTS5 physical manifests omit query-time weights, so weight-only edits classify as runtime-only.
- Phase 2 proof uses a manual contentful index; linked triggers land in Phase 4.

## Known upstream limitations

- FTS5 `secure-delete` availability is probed rather than assumed.

## Blockers

None.

## Latest verification result

`bun run verify` passed on 2026-08-16 after Phase 2.
