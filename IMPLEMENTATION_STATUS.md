# SiftLite Implementation Status

This file records execution progress. Architecture remains controlled by the
implementation pack and accepted ADRs.

## Current phase

Phase 9 — Portable Arabic normalization

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

## Remaining

Phases 10–14 (ORMs, fuzzy, CLI, RC) and conditional Phase 15.

## Tests executed

`bun run verify`

## Significant implementation decisions

- Linked-mode normalization is a finite replacement table with identical JS and
  SQL `replace()` forms. No NFC/NFKC is applied on the portable path.
- `arabic-basic` removes tatweel, U+064B–U+0652 harakat, and superscript alef,
  and maps selected precomposed alef variants plus alef maqsura. `ة/ؤ/ئ`,
  Arabic-Indic digits, presentation forms, and Quranic marks stay unchanged.
- `numeric-arabic` is an optional second profile for U+0660–U+0669 only.
- FTS stores normalized searchable text; `*_source` columns keep originals.
- Application search normalizes raw query text once before the portable parser.

## Known upstream limitations

- Turso native FTS remains experimental.
- Remote D1/libSQL credentials are unavailable in this environment.
- D1 export does not support databases containing FTS5 virtual tables.
- FTS5 `unicode61` is not equivalent to the portable parser; combining Arabic
  marks can split FTS tokens unless `arabic-basic` runs first.

## Blockers

None for Phases 0–9.

## Latest verification result

`bun run verify` passed after Phase 9 (format, lint, typecheck, build, 118 bun tests, 5 D1 Workers tests, export check).
