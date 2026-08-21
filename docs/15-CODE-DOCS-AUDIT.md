# Code and Documentation Audit

Original audit: **2026-08-19** against `@siftlite/*@0.1.0`.

Follow-up: **2026-08-21** against `@siftlite/*@0.2.0`. Must-fix gaps 1–5 and
the operational CLI (Phase 13) closed in `0.2.0`. P12-06 always-merge ranking,
P12-08/09 local benches, D1 replica modeling (gap 8), and Phase 14 evidence
(except owner-gated publish) are closed on this branch. P12-10 is a skip
report until D1 credentials exist. See `IMPLEMENTATION_STATUS.md`.

Shipped version reviewed in this follow-up: **0.2.0**

Scope: root/package/example READMEs, the `www/` documentation site, the v1.2
implementation pack, public exports, runtime validation, lifecycle code, CLI,
tests, and current Cloudflare D1 documentation.

## Authority and verdict

The TypeScript source and tests are authoritative for shipped behavior. The
files in `docs/` remain architecture and decision records: they describe both
implemented behavior and contracts the implementation still owes.

Public product pages in `www/` should describe `0.2.0`. On the 0.2.0 branch,
typo fallback applies bound scope/filters, companion SQL emits trigram DDL
for fallback definitions, facet request typing accepts sortable keys, and
the CLI loads a host config for check/doctor/lifecycle commands.

## Closed in 0.2.0

These were must-fix (or CLI-blocking) findings in the 0.1.0 audit. They are
historical; do not treat the 0.1.0 line numbers below as current code.

### 1. Fuzzy fallback preserves filters and bound scope

- **0.1.0:** candidate SQL was trigram `MATCH` + `LIMIT` only; per-candidate
  document reads were keyed only by source ID.
- **0.2.0:** candidate retrieval compiles `request.scope` and `request.filter`
  into the same candidate `WHERE` (`packages/fts5/src/search/execute.ts`).
  Searchable text is batch-loaded. Tests live in
  `packages/fts5/tests/fuzzy.test.ts`.
- Keep fallback off on D1 until P12-08–10 cost evidence exists. That is a
  cost/policy choice, not a scope-bypass workaround.

### 2. Fuzzy response metadata describes fuzzy survivors

- **0.1.0:** fallback replaced hits after an empty exact result but reused
  exact-query `hasMore`, totals, and facets; highlighting was omitted.
- **0.2.0:** when fallback produces hits, `page.hasMore`, opt-in `totalHits`,
  and facets are computed from the fuzzy survivor set. Highlighting remains
  omitted with warning `highlight-unavailable-fuzzy`. Field sort is not
  applied (hits are ordered by edit distance). Those two exceptions are
  shipped behavior, not open bugs.

### 3. Declared fuzzy bounds are wired

- **0.1.0:** `minGramOverlap` was unused; `ApplicationLimits.maxFuzzyCandidates`
  was unused; candidate text was one query per ID.
- **0.2.0:** candidate retrieval ORs generated grams, then enforces
  `minGramOverlap` before edit-distance scoring. The effective cap is
  `min(policy.maxCandidates, limits.maxFuzzyCandidates)`. Candidate text is
  loaded in batched `IN` chunks. Defaults remain
  `DEFAULT_FUZZY_POLICY` (`packages/core/src/fuzzy/policy.ts`) and
  `DEFAULT_APPLICATION_LIMITS.maxFuzzyCandidates` (`200`).

### 4. Companion SQL emits and verifies the fallback trigram table

- **0.1.0:** `compileIndexLifecycleSql` omitted `compileFtsTrigramDdl`;
  manifest/integrity did not require the trigram object.
- **0.2.0:** companion SQL emits trigram DDL when
  `typoTolerance.mode === "fallback"`
  (`packages/fts5/src/lifecycle/companion-sql.ts`). The physical manifest
  lists `ftsTrigram`; integrity reports `missing-trigram` when it is absent
  (`packages/fts5/src/lifecycle/verify.ts`). Runtime `createIndex` remains
  the path that verifies objects and marks a `pending` registry row healthy.

### 5. Facet request typing accepts sortable keys

- **0.1.0:** `defineIndex` allowed filterable **or** sortable facet fields,
  but `SearchRequest.facets` was typed as `TFilterable[]`.
- **0.2.0:** `SearchRequest.facets` is
  `readonly (TFilterable | TSortable)[]`
  (`packages/core/src/search/types.ts`). Typed engine handles follow that.
  Requested facets still have to be declared on the definition.

### 7. Operational CLI is implemented

- **0.1.0:** `help` / `version` / `generate` worked; `check` / `doctor` and
  lifecycle commands returned adapter-required errors.
- **0.2.0:** `init` writes `siftlite.config.mjs`. `check`, `doctor`,
  `backfill`, `rebuild`, `merge`, and `drop` load that config
  (`createAdapter()` + `indexes`). Mutating commands require `--acknowledge`
  unless `--dry-run`. `merge` accepts `--page-budget` (default `8`).
  `siftlite check --help` still runs `check`; there is no subcommand-help
  parser.

## Documented behavior (not a 0.2.0 gap)

### 6. Generic engine hydration is projection hydration

The generic search path defaults to `createProjectionHydrator`
(`packages/fts5/src/search/execute.ts`), which selects the source ID plus
declared searchable/filterable/sortable fields from the internal docs table
(`packages/fts5/src/search/hydrate.ts`). `createSourceTableHydrator` exists
but is not the engine default. Drizzle and Prisma supply ORM hydrators.
Public search and API pages describe those three behaviors separately.

## Closed in this follow-up

### 8. D1 `readReplicaEligible` matches Sessions routing

`readReplicaEligible` means this execution target may be routed to a replica.
Plain `d1Adapter` sets it `false` (Cloudflare documents non-session queries as
primary-only). `d1SessionAdapter` sets it `true`. Post-commit read-your-writes
remain session-only.

### P12-06 always-merge ranking

`fallback` appends fuzzy-only survivors behind the exact/prefix group. Exact
hits keep backend order and scores; fuzzy hits have `score: null`. Totals and
facets are the disjoint union.

### P12-08 / P12-09 / P12-10 benches

Local 100k and 1m reports plus the D1 skip/harness live in `docs/benchmarks/`.
D1 typo fallback stays off by default without remote cost evidence.

### Phase 14

See `docs/16-V1-RC.md`. P14-10 npm publish remains owner-gated.

## Remaining

- P14-10 owner-gated RC publish.
- Phase 15 Turso-native graduation (upstream experimental).
- Architecture-pack `FuzzyCandidatePolicy` still mentions function-valued
  `minGramOverlap` and `maxCandidateTextBytes`; shipped policy is numeric
  overlap only (`packages/core/src/fuzzy/policy.ts`).

## Documentation conflicts resolved (0.1.0 pass, still true)

- Corrected standalone examples to call `.search(...)` on a defined index
  handle instead of an undefined `products` object.
- Corrected one-off CLI invocation to
  `npx --package=@siftlite/cli siftlite ...`; `npx siftlite` remains valid after
  locally installing `@siftlite/cli`.
- Corrected typo policy wording: a fallback-enabled definition throws when
  policy/probes disable the capability; it does not silently run exact-only.
- Corrected companion migration finalization: generated SQL seeds `pending`;
  one matching `createIndex` call verifies/finalizes an intact generation.
- Corrected `SqlAdapter` documentation: `batch` and `transaction` are optional
  (`packages/core/src/sql/adapter.ts`).
- Rechecked D1
  [SQL limits](https://developers.cloudflare.com/d1/platform/limits/),
  [Sessions behavior and batch atomicity](https://developers.cloudflare.com/d1/worker-api/d1-database/),
  and [FTS5 export limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
  against Cloudflare primary documentation. FTS5 secure-delete wording
  was checked against the
  [SQLite reference](https://www.sqlite.org/fts5.html#the_secure_delete_configuration_option).

## Verification

### 0.1.0 publish (2026-08-19, historical)

- Nimbus docs preflight and final checks passed. The Astro site built 34
  pages; Pagefind indexed 32 content pages.
- Main test suite passed 261 tests in 57 files. D1 worker suite passed 7
  tests in 2 files. All ten packages returned `0.1.0` from npm at that time.

### 0.2.0 (2026-08-19 branch `cursor/grok-4-6-subagents-workflows-e3a2`)

Recorded in `IMPLEMENTATION_STATUS.md`: `bun run typecheck` and
`bun run build` passed; `bun run check-exports` passed for all ten packages;
`bun test` passed 288 tests; `bun run test:d1` passed 7 Workers tests.

The public Worker site lagged this follow-up until the `www/` rebuild/deploy
after the 0.2.0 content and version-banner edits.
