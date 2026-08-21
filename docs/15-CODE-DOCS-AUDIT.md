# Code and Documentation Audit

Audit date: **2026-08-19** (original docs pass)

Follow-up: **2026-08-19** branch `cursor/grok-4-6-subagents-workflows-e3a2`
closed must-fix gaps 1–5 and the operational CLI (Phase 13). Those closures
shipped as `@siftlite/*@0.2.0`. Remote cost benches (P12-08–10), P12-06
always-merge ranking, and Phase 14 remain open. Treat the sections below as
the historical `0.1.0` publish audit; see `IMPLEMENTATION_STATUS.md` for
current status.

Shipped version reviewed: **0.1.0** (superseded by **0.2.0**)

Scope: root/package/example READMEs, the `www/` documentation site, the v1.2
implementation pack, public exports, runtime validation, lifecycle code, CLI,
tests, and current Cloudflare D1 documentation.

## Authority and verdict

The TypeScript source and tests are authoritative for shipped behavior. The
files in `docs/` remain architecture and decision records: they describe both
implemented behavior and contracts the implementation still owes.

The public docs are buildable after this pass. On the follow-up branch, typo
fallback applies bound scope/filters, companion SQL emits trigram DDL for
fallback definitions, facet request typing accepts sortable keys, and the
CLI loads a host config for check/doctor/lifecycle commands.

## Must-fix implementation gaps

### 1. Fuzzy fallback does not preserve filters or bound scope

- **Intended contract:** bound scope applies to hits, facets, totals, fuzzy
  candidates, and hydration (`docs/12-ADRS.md:297` and
  `docs/04-SEARCH-API-AND-QUERY-ENGINE.md:212`).
- **Shipped behavior:** exact search passes `request.filter` and
  `request.scope` into compilation (`packages/fts5/src/search/execute.ts:163`),
  but the fallback candidate SQL contains only trigram `MATCH` and `LIMIT`
  (`packages/fts5/src/search/execute.ts:323`). Its per-candidate document read
  is also keyed only by source ID (`packages/fts5/src/search/execute.ts:354`).
- **Impact:** after exact search returns no hits, fallback can return an ID or
  hydrated document outside a mandatory tenant/authorization scope.
- **Docs resolution:** the public scope, search, and typo pages now tell users
  to keep fallback off for scoped or authorization-filtered indexes.
- **Code resolution still required:** compile the same scope/filter into
  candidate retrieval and candidate document reads, then add bypass tests.

### 2. Fuzzy response metadata describes the exact query, not fuzzy hits

- **Claim corrected:** totals, facets, highlighting, and `page.hasMore` were
  previously described without a fallback exception.
- **Shipped behavior:** fallback replaces hits only after the exact result is
  empty (`packages/fts5/src/search/execute.ts:218`). Exact-query `hasMore` is
  computed before fallback (`packages/fts5/src/search/execute.ts:183`), while
  totals and facets reuse the exact compiled query afterward
  (`packages/fts5/src/search/execute.ts:228`). Fuzzy hits never receive
  formatted highlights (`packages/fts5/src/search/execute.ts:404`).
- **Docs resolution:** the limitation is explicit on the search and typo pages.
- **Code resolution still required:** either compute response fields from the
  fuzzy result set or make them unavailable with typed warnings/errors.

### 3. The declared fuzzy bounds are not all wired into search

- **Intended contract:** use a minimum gram-overlap threshold and application
  candidate budget (`docs/07-ARABIC-AND-TYPO-TOLERANCE.md`).
- **Shipped behavior:** `DEFAULT_FUZZY_POLICY` declares `minGramOverlap` and
  `maxCandidates` (`packages/core/src/fuzzy/policy.ts:3`), but search emits a
  simple OR expression and never reads `minGramOverlap`
  (`packages/fts5/src/search/execute.ts:329`).
  `ApplicationLimits.maxFuzzyCandidates` exists
  (`packages/core/src/limits/application-limits.ts:3`) but fallback uses the
  fixed policy value instead.
- **Additional cost gap:** candidate searchable text is loaded with one query
  per candidate (`packages/fts5/src/search/execute.ts:354`), contrary to the
  bounded payload/batched-read design.
- **Docs resolution:** the defaults table distinguishes declared from enforced
  limits, and implementation task status was corrected.

### 4. Companion SQL omits the fallback trigram table

- **Claim corrected:** ORM docs previously gave contradictory advice about
  applying companion SQL and then calling `createIndex`.
- **Shipped behavior:** `compileIndexLifecycleSql` emits registry, docs, FTS,
  indexes, triggers, and backfill, but not `compileFtsTrigramDdl`
  (`packages/fts5/src/lifecycle/companion-sql.ts:19`). Runtime materialization
  does emit the trigram table (`packages/fts5/src/lifecycle/operations.ts:115`).
- **Detection gap:** the physical manifest lists docs/FTS/triggers but not the
  trigram table (`packages/fts5/src/manifest.ts:12`), and integrity checks only
  require docs/FTS (`packages/fts5/src/lifecycle/verify.ts:12`). A migrated
  fallback definition can therefore be marked healthy without its trigram
  table.
- **Docs resolution:** lifecycle, Drizzle, and Prisma docs require the runtime
  path for fallback-enabled definitions in `0.1.0`.
- **Code resolution still required:** emit, hash, and verify the trigram object.

## Other code/API gaps

### 5. Facet definition and typed request disagree

- `defineIndex` accepts facet fields declared filterable **or sortable**
  (`packages/core/src/definition/define-index.ts:110`).
- Runtime facet execution resolves either storage map
  (`packages/fts5/src/search/facets.ts:41`).
- `SearchRequest<TFilterable, ...>.facets` is typed only as
  `TFilterable[]` (`packages/core/src/search/types.ts:26`), and the engine
  preserves that narrowing (`packages/fts5/src/engine.ts:44`).

The public docs now recommend declaring requested facets filterable until the
type contract is widened or the definition contract is narrowed.

### 6. Generic engine hydration is projection hydration

The previous search guide said linked-mode hydration reads the source table.
The generic search path defaults to `createProjectionHydrator`
(`packages/fts5/src/search/execute.ts:188`), which selects only the source ID
and declared searchable/filterable/sortable fields from the internal docs
table (`packages/fts5/src/search/hydrate.ts:20`). A separate
`createSourceTableHydrator` exists (`packages/fts5/src/search/hydrate.ts:63`)
but is not the engine default. Drizzle and Prisma supply ORM hydrators.

The guide and API reference now describe those three behaviors separately.

### 7. The operational CLI is not implemented yet

The old phase/status prose implied Phase 13 was complete. The CLI currently:

- implements `help`, `version`, and `generate`
  (`packages/cli/src/cli.ts:20`);
- always returns an adapter-required error for `check` and `doctor`
  (`packages/cli/src/cli.ts:49`);
- requires acknowledgement and then returns an adapter-required error for
  `backfill`, `rebuild`, `merge`, and `drop`
  (`packages/cli/src/cli.ts:56`).

The CLI docs and task/status files now call these placeholders. The stale
`siftlite check --help` example was removed because flags after a subcommand do
not invoke a subcommand help parser.

### 8. D1's code model is more conservative than current provider guidance

`D1_DATABASE_CONSISTENCY` marks plain bindings as replica-eligible and without
post-commit read-your-writes (`packages/d1/src/limits.ts:23`). Cloudflare's
current D1 API documentation says read replication requires Sessions and that
queries without Sessions continue on the primary:
<https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession>.

The public docs now distinguish Cloudflare's current behavior from SiftLite's
conservative capability promise. A future code change should decide whether
`readReplicaEligible` describes possible platform routing or actual routing of
this execution target, then test and name that meaning precisely.

## Documentation conflicts resolved

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
  (`packages/core/src/sql/adapter.ts:7`).
- Corrected highlighting errors, hydration behavior, CLI status, fuzzy bounds,
  and the stale Bun example statement that typo fallback was not implemented.
- Verified all ten documented public packages return `0.1.0` from npm.
- Rechecked D1
  [SQL limits](https://developers.cloudflare.com/d1/platform/limits/),
  [Sessions behavior and batch atomicity](https://developers.cloudflare.com/d1/worker-api/d1-database/),
  and [FTS5 export limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
  against current Cloudflare primary documentation. FTS5 secure-delete wording
  was checked against the
  [SQLite reference](https://www.sqlite.org/fts5.html#the_secure_delete_configuration_option).

## Verification

Completed on 2026-08-19:

- Nimbus docs preflight and final checks passed with zero errors, warnings, or
  notes. Astro type checking passed with zero errors, warnings, or hints.
- The Astro site built 34 pages; Pagefind indexed 32 content pages. Generated
  `llms.txt`, `llms-full.txt`, `robots.txt`, `og.png`, and Pagefind assets were
  present in the build output.
- Repository formatting, type checking, package builds, and export checks
  passed. Biome completed with 20 warnings and 44 informational diagnostics in
  existing production code, but no error exit.
- The main test suite passed 261 tests in 57 files. The D1 worker suite passed
  7 tests in 2 files when rerun outside the filesystem sandbox; the first
  combined run could not open its local loopback listener (`EPERM`).
- The Bun, libSQL, and Drizzle examples executed successfully.

The Astro build also reports an upstream Vite deprecation warning for
`optimizeDeps.esbuildOptions`; it does not fail the build.
