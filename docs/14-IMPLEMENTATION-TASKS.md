# SiftLite Implementation Tasks

This file is the executable backlog for `10-IMPLEMENTATION-ROADMAP.md`. Task IDs are stable within v1.2 so implementation agents can report progress precisely.

## Phase 0 — Repository foundation

- [x] **P0-01** Create Bun workspace monorepo and root scripts.
- [x] **P0-02** Add strict shared TypeScript configs for edge-safe core and package builds.
- [x] **P0-03** Add `bun:test`, lint, format, typecheck, build, and `bun run verify`.
- [x] **P0-04** Add CI that runs from a clean install and caches safely.
- [x] **P0-05** Create only `@siftlite/core`, `@siftlite/fts5`, `@siftlite/bun`, `@siftlite/testing` skeletons.
- [x] **P0-06** Configure package exports/types/source maps and release workflow.
- [x] **P0-07** Add README, contributing, security policy, license, and minimal example.
- [x] **P0-08** Add dependency-boundary test preventing runtime/ORM imports in core.

**Gate:** clean `bun install && bun run verify`; no package sprawl; core is runtime-agnostic.

## Phase 1 — Core contracts and budgets

- [x] **P1-01** Implement `SourceId` definition/validation and exact string-vs-number preservation.
- [x] **P1-02** Implement `SearchStorageKind` and canonical codecs for text/safe integer/finite real/boolean.
- [x] **P1-03** Add explicit integer timestamp codec/unit configuration.
- [x] **P1-04** Reject BigInt/NaN/Infinity/objects/unsupported values with typed errors.
- [x] **P1-05** Implement logical index definition schema and canonicalization/hash.
- [x] **P1-06** Implement safe filter AST/builders and NULL semantics types.
- [x] **P1-07** Implement backend-neutral text-query AST.
- [x] **P1-08** Implement portable plain-text parser (intent, not backend lexical emulation).
- [x] **P1-09** Implement immutable bound-scope representation outside user filter AST.
- [x] **P1-10** Implement application safety limits.
- [x] **P1-11** Implement `RuntimeSqlLimits` and unknown/unproven semantics.
- [x] **P1-12** Implement read-consistency capability model.
- [x] **P1-13** Implement effective capability intersection/resolution.
- [x] **P1-14** Implement statement budget calculator/reservation utilities.
- [x] **P1-15** Add fuzz/property tests for AST/query injection and scalar boundaries.

**Gate:** illegal scalars and over-budget plans fail before runtime SQL; scope cannot be user-negated.

## Phase 2 — FTS5 proof on Bun

- [x] **P2-01** Implement `@siftlite/bun` SQL adapter.
- [x] **P2-02** Implement FTS5 backend capability probes.
- [x] **P2-03** Implement contentful FTS5 physical manifest/compiler proof.
- [x] **P2-04** Implement safe FTS5 text-query emitter.
- [x] **P2-05** Implement exact/multi-term/phrase/prefix search.
- [x] **P2-06** Implement weighted BM25/rank ordering and opaque score mapping.
- [x] **P2-07** Implement basic structured filter/sort compilation with bind budgeting.
- [x] **P2-08** Implement manual proof index/upsert/delete.
- [x] **P2-09** Probe FTS5 trigram/secure-delete/vocabulary capabilities.
- [x] **P2-10** Add controlled relevance and malicious-query corpus.

**Gate:** FTS5 proof semantics pass on Bun and no raw ordinary input reaches backend grammar.

## Phase 3 — Early Turso-native pressure test

- [x] **P3-01** Create internal experimental Turso-native backend skeleton.
- [x] **P3-02** Compile representative logical schema to native physical manifest fixture.
- [x] **P3-03** Compile portable term/phrase/prefix subset to native search syntax fixture.
- [x] **P3-04** Model native score direction/weights/highlight capabilities.
- [x] **P3-05** Model native maintenance and visibility differences.
- [x] **P3-06** Audit core/public types for FTS5-specific assumptions and fix them.
- [x] **P3-07** Record upstream experimental/stability status and remote-test availability.

**Gate:** second-backend compiler can use core contracts without FTS5 leakage.

## Phase 4 — Registry, linked/manual storage, lifecycle

- [x] **P4-01** Implement registry schema with stable physical ID + active generation.
- [x] **P4-02** Implement deterministic internal identifier validation/quoting.
- [x] **P4-03** Implement physical manifest hash/version and change classifier.
- [x] **P4-04** Implement typed linked projection/document table compiler.
- [x] **P4-05** Implement linked contentful FTS table compiler.
- [x] **P4-06** Generate INSERT trigger.
- [x] **P4-07** Generate UPDATE trigger including searchable/projected fields.
- [x] **P4-08** Generate source-primary-key update behavior preserving internal doc identity where valid.
- [x] **P4-09** Generate DELETE trigger/order.
- [x] **P4-10** Implement initial backfill.
- [x] **P4-11** Implement authoritative manual document table and derived FTS rebuild.
- [x] **P4-12** Implement create/drop/rebuild plans.
- [x] **P4-13** Implement `check` and `doctor` library APIs.
- [x] **P4-14** Enforce registry-update-last operation ordering.
- [x] **P4-15** Add drift/partial-object/source-ID/raw-SQL CRUD conformance tests.

**Gate:** lifecycle invariants and both storage modes are recoverable and drift-detectable.

## Phase 5 — Projection migrations, privacy, bounded maintenance

- [x] **P5-01** Detect migration-only projected-field changes.
- [x] **P5-02** Plan projection storage preparation/addition.
- [x] **P5-03** Implement bounded existing-row backfill executor/resume token.
- [x] **P5-04** Create/recreate required B-tree indexes after/with backfill as appropriate.
- [x] **P5-05** Regenerate triggers for new projected fields.
- [x] **P5-06** Verify counts/samples/source-ID types/trigger writes before registry update.
- [x] **P5-07** Implement FTS5 bounded `merge` maintenance.
- [x] **P5-08** Implement incremental optimize orchestration.
- [x] **P5-09** Implement FTS5 secure-delete policy + runtime/version gate.
- [x] **P5-10** Add interrupted-backfill and interrupted-maintenance recovery tests.

**Gate:** no partial migration is falsely healthy; maintenance can be bounded; privacy policy fails closed.

## Phase 6 — Full application semantics

- [x] **P6-01** Complete nested filter compiler and documented NULL behavior.
- [x] **P6-02** Make `IN`/`notIn` compilation consume remaining runtime bind budget.
- [x] **P6-03** Add deterministic field/relevance sorting with final tie-breaker.
- [x] **P6-04** Add conjunctive facets and numeric facet stats.
- [x] **P6-05** Add empty-query browsing with `score: null`.
- [x] **P6-06** Add bounded query-time synonyms.
- [x] **P6-07** Add highlight/snippet capability handling.
- [x] **P6-08** Add canonical ID-first results and hydrator interface.
- [x] **P6-09** Add hydration chunking based on remaining runtime bind budget.
- [x] **P6-10** Add default `hasMore` pagination.
- [x] **P6-11** Add explicit `includeTotal` exact-total path.
- [x] **P6-12** Add opt-in diagnostics without bound values/sensitive content.

**Gate:** Tier A application semantics pass on Bun with budget/NULL/facet/total tests.

## Phase 7 — Cloudflare D1

- [x] **P7-01** Implement D1 prepared-query/execute adapter.
- [x] **P7-02** Encode current D1 documented limit profile behind adapter data/probes.
- [x] **P7-03** Support database/session-like execution target abstraction.
- [x] **P7-04** Implement consistency metadata and bookmark/session integration surface.
- [x] **P7-05** Add Workers Vitest integration test harness with D1 binding.
- [x] **P7-06** Run shared adapter/backend conformance in Workers runtime.
- [x] **P7-07** Test parameter/function/statement limits near boundaries.
- [x] **P7-08** Test source-ID binding boundaries and reject BigInt/unsafe integers.
- [x] **P7-09** Add session/sequential-consistency test scenario.
- [x] **P7-10** Add D1 migration/example app.
- [x] **P7-11** Add optional remote smoke/cost/rows-read test job.
- [x] **P7-12** Document FTS virtual-table export/rebuild workflow after rechecking Cloudflare docs.

**Gate:** D1 claims are backed by Workers-runtime evidence; fuzzy remains policy-off by default.

## Phase 8 — libSQL

- [ ] **P8-01** Define minimal libSQL-like client interface used by adapter.
- [ ] **P8-02** Implement `@siftlite/libsql` without concrete client leakage into core.
- [ ] **P8-03** Map batch/transaction/runtime capabilities.
- [ ] **P8-04** Run shared FTS5 conformance locally.
- [ ] **P8-05** Add optional remote smoke fixtures.
- [ ] **P8-06** Add migration/example app.

**Gate:** claimed semantics pass and adapter boundary remains client-compatible, not class-coupled.

## Phase 9 — Arabic normalization

- [ ] **P9-01** Implement normalizer interface and index-level profile validation.
- [ ] **P9-02** Implement conservative JS `arabic-basic` replacements/removals.
- [ ] **P9-03** Implement deterministic portable SQL expression compiler.
- [ ] **P9-04** Build curated Arabic equivalence/non-equivalence corpus.
- [ ] **P9-05** Run JS-vs-SQL corpus on Bun.
- [ ] **P9-06** Run corpus in D1 Workers runtime.
- [ ] **P9-07** Run corpus on libSQL.
- [ ] **P9-08** Add punctuation/combining-mark/mixed Arabic-English parser/analyzer fixtures.

**Gate:** accepted linked-mode transforms are identical across all stable v1 runtimes.

## Phase 10 — Drizzle

- [ ] **P10-01** Define supported Drizzle versions/metadata surface.
- [ ] **P10-02** Map Drizzle schema metadata to canonical SiftLite schema/codecs.
- [ ] **P10-03** Implement typed `defineDrizzleIndex`.
- [ ] **P10-04** Integrate deterministic migration generation.
- [ ] **P10-05** Implement batched rank-preserving hydration.
- [ ] **P10-06** Add compile-time positive/negative fixtures.
- [ ] **P10-07** Add Bun/D1/libSQL CRUD/raw-SQL trigger ownership fixtures as applicable.

**Gate:** ORM is ergonomic metadata only; it does not own synchronization or core types.

## Phase 11 — Prisma

- [ ] **P11-01** Define supported Prisma versions.
- [ ] **P11-02** Implement canonical Prisma search service wrapper.
- [ ] **P11-03** Implement companion SQL migration workflow.
- [ ] **P11-04** Add optional Client Extension model method.
- [ ] **P11-05** Add batched hydrated model return path.
- [ ] **P11-06** Add type/version/CRUD/raw-SQL fixtures.

**Gate:** no FTS model/hooks are required and integration stays optional.

## Phase 12 — Typo tolerance

- [ ] **P12-01** Implement Unicode code-point length/trigram generator.
- [ ] **P12-02** Define `FuzzyCandidatePolicy` defaults/validation.
- [ ] **P12-03** Compile bounded trigram OR/overlap retrieval.
- [ ] **P12-04** Enforce minimum gram overlap and candidate cap before large payloads.
- [ ] **P12-05** Implement/test Damerau-Levenshtein scorer.
- [ ] **P12-06** Merge fuzzy results behind exact/prefix groups.
- [ ] **P12-07** Test <3-code-point exclusion and Unicode edge cases.
- [ ] **P12-08** Add 100k corpus recall/latency benchmark.
- [ ] **P12-09** Add local 1m characterization.
- [ ] **P12-10** Measure D1 remote cost/rows/read/time when credentials allow.
- [ ] **P12-11** Keep D1 fuzzy off by default unless an explicit policy/benchmark decision changes it.

**Gate:** bounded recall improvement with no accidental broad scans or exact-hit displacement.

## Phase 13 — CLI

- [ ] **P13-01** Implement portable CLI bootstrap and config loading.
- [ ] **P13-02** `init`.
- [ ] **P13-03** `generate`.
- [ ] **P13-04** `check`.
- [ ] **P13-05** `doctor`.
- [ ] **P13-06** `backfill`.
- [ ] **P13-07** `rebuild`.
- [ ] **P13-08** `merge`/incremental `optimize`.
- [ ] **P13-09** safe `drop`.
- [ ] **P13-10** dry-run and machine-readable JSON output.
- [ ] **P13-11** explicit destructive acknowledgement/operation status.
- [ ] **P13-12** smoke tests under supported Node and Bun runtimes.

**Gate:** noninteractive CI and safe operations work without making Bun a consumer runtime requirement.

## Phase 14 — v1.0 RC

- [ ] **P14-01** Freeze/review public API and package exports.
- [ ] **P14-02** Complete compatibility matrix.
- [ ] **P14-03** Run full conformance matrix and fuzz suites.
- [ ] **P14-04** Run security/dependency/license review.
- [ ] **P14-05** Produce 1m benchmark report and methodology.
- [ ] **P14-06** Produce D1 remote operational report where available.
- [ ] **P14-07** Dogfood on a non-trivial application schema including shared-tenant scope or document why per-tenant DB was chosen.
- [ ] **P14-08** Validate migration upgrade/recovery docs on a copy of a realistic DB.
- [ ] **P14-09** Review secure-delete wording and provider-backup caveats.
- [ ] **P14-10** Publish RC and run clean-consumer install examples.

**Gate:** all stable claims have evidence; no unresolved P0/P1 architecture gap remains.

## Phase 15 — Conditional Turso-native graduation

- [ ] **P15-01** Re-check upstream FTS/index-method stability.
- [ ] **P15-02** Implement/complete production runtime adapter/backend path.
- [ ] **P15-03** Pass Tier A/native conformance and lifecycle tests.
- [ ] **P15-04** Validate remote visibility/maintenance/migrations.
- [ ] **P15-05** Audit package docs for experimental-vs-stable status.
- [ ] **P15-06** Graduate `@siftlite/turso` only if the upstream + SiftLite gates permit it.

**Gate:** no misleading stable label while required upstream semantics are experimental.
