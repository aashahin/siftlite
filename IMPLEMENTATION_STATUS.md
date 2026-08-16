# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

Phase 1 — Core contracts and budgets

## Status

PASS

## Completed tasks

### Phase 0

- P0-01 through P0-08

### Phase 1

- P1-01 SourceId validation and string-vs-number preservation
- P1-02 SearchStorageKind and canonical codecs
- P1-03 Explicit integer timestamp codec/unit
- P1-04 Reject BigInt/NaN/Infinity/objects
- P1-05 Logical index definition, canonicalization, and hash
- P1-06 Filter AST/builders and NULL semantics
- P1-07 Backend-neutral text-query AST
- P1-08 Portable plain-text parser
- P1-09 Immutable bound-scope representation
- P1-10 Application safety limits
- P1-11 RuntimeSqlLimits with unproven semantics
- P1-12 Read-consistency capability model
- P1-13 Effective capability resolution
- P1-14 Statement budget calculator
- P1-15 Fuzz/property tests for AST/query injection and scalars

## Tests executed

```bash
bun run verify
```

Results:

- format/check: pass
- lint: pass
- typecheck: pass
- unit: 45 passed / 0 failed
- build: pass
- export checks: pass

## Significant implementation decisions

- Portable SHA-256 in core is a drift identifier, not a security primitive.
- Searchable field order is preserved in the logical hash; synonym maps are sorted.
- Bound scopes use `kind: "bound-scope"` and cannot appear in the user filter AST.
- `undefined` runtime SQL limits are represented as `"unproven"` and never treated as unlimited.
- The portable parser treats FTS/Tantivy operator lookalikes as ordinary text.

## Known upstream limitations

- TypeScript 7 is available from npm, but the repo pins TypeScript 5.9.3.

## Blockers

None.

## Latest verification result

`bun run verify` passed on 2026-08-16 after Phase 1.
