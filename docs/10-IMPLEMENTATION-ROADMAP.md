# SiftLite Implementation Roadmap

## Execution rule

Phases are ordered by architectural risk and dependency. Every phase has a hard gate and a task-ID range mirrored in `14-IMPLEMENTATION-TASKS.md`.

A later phase may start only when every required predecessor is **PASS**. Partial work is allowed, but must be reported as PARTIAL/BLOCKED and must not be hidden behind skipped tests or weakened acceptance criteria.

---

## Phase 0 — Repository, naming, and quality foundation (`P0-*`)

### Deliverables

- Bun workspace monorepo and strict TypeScript baseline;
- package/export/build conventions;
- lint/format/typecheck/test/CI pipeline;
- release/version workflow and contribution docs;
- initial packages only: `@siftlite/core`, `@siftlite/fts5`, `@siftlite/bun`, `@siftlite/testing`;
- public naming/README/API examples consistently use SiftLite.

### Gate

- clean checkout -> `bun install` -> `bun run verify` succeeds;
- core contains no Node/Bun/D1/ORM imports;
- package names/exports are deterministic;
- no empty package sprawl.

---

## Phase 1 — Core contracts, codecs, scopes, runtime budgets (`P1-*`)

### Deliverables

- `IndexDefinition` and validation;
- `SourceId = string | safe-integer number`;
- canonical `SearchStorageKind` + built-in field codecs;
- filter/text ASTs and safe plain-text parser;
- immutable scope AST/predicate boundary;
- application safety limits;
- `RuntimeSqlLimits` and read-consistency model;
- base/effective capability resolver;
- logical definition canonicalization/hash;
- typed errors for invalid values/runtime-budget overflow.

### Gate

- unsafe integers, BigInt, NaN, Infinity, arbitrary objects fail before SQL;
- scope cannot be represented as a user-removable filter;
- runtime `undefined` limits mean unproven, not unlimited;
- query/filter fuzz tests do not produce backend grammar injection.

---

## Phase 2 — Bun SQLite + FTS5 proof (`P2-*`)

### Deliverables

- Bun runtime adapter;
- FTS5 backend/compiler proof;
- manual proof index;
- contentful FTS5;
- exact/multi-term/phrase/prefix search;
- weighted BM25/rank semantics;
- basic filters/sort;
- FTS5 runtime/tokenizer probes;
- FTS5 secure-delete capability probe (not necessarily enabled by default).

### Gate

- controlled corpus has expected relative ranking;
- source IDs preserve logical type;
- ordinary user strings never become raw `MATCH` grammar;
- FTS5 conformance smoke suite passes on Bun.

---

## Phase 3 — Early Turso-native architecture pressure spike (`P3-*`)

**This is intentionally early. It is not a stable backend commitment.**

### Deliverables

- experimental internal backend compiler skeleton for current Turso-native FTS semantics;
- representative logical definition -> native physical manifest;
- portable AST -> native search expression compiler fixture;
- score-direction/weight/highlight/maintenance/visibility mapping;
- review of every public type for FTS5-only assumptions.

### Gate

- no public/core type requires FTS5 `MATCH`, rowid, BM25 sign convention, tokenizer syntax, or FTS5 maintenance commands;
- backend manifests can classify native physical weights/tokenizers independently;
- any unavailable remote validation is explicitly recorded.

If this gate fails, fix core before Phase 4.

---

## Phase 4 — Physical identity, storage, registry, lifecycle (`P4-*`)

### Deliverables

- registry with stable `physical_index_id`, active generation, logical hash, physical manifest hash/version;
- deterministic generation-scoped physical names;
- linked projection table with typed source IDs;
- contentful FTS5 + generated INSERT/UPDATE/DELETE/source-PK-update triggers;
- authoritative manual document table;
- create/drop/backfill/rebuild/check/doctor library APIs;
- migration planner with runtime-only/migration-only/rebuild-required/unsupported classifications;
- failure-safe operation/registry ordering.

### Gate

- linked raw SQL CRUD stays synchronized;
- manual FTS can be recreated from normal authoritative documents alone;
- definition-hash-only runtime edits do not rename/rebuild physical objects;
- partial physical state is detected and never marked healthy.

---

## Phase 5 — Projection migrations and bounded maintenance (`P5-*`)

### Deliverables

- migration-only projected-field lifecycle: prepare -> bounded backfill -> B-tree index -> trigger regeneration -> verification -> registry update;
- resumable/backpressure-aware chunk execution hooks;
- budgeted FTS5 merge API;
- incremental optimize plan;
- secure-delete policy application/version gating;
- maintenance status/doctor reporting.

### Gate

- interrupted backfill is detectable/resumable and never healthy prematurely;
- adding a filter/sort/facet field updates existing rows correctly;
- remote-safe maintenance can stop after bounded work;
- secure-delete required policy fails closed when unsupported.

---

## Phase 6 — Application search semantics (`P6-*`)

### Deliverables

- nested structured filters and documented NULL semantics;
- budget-aware `IN` compilation;
- deterministic sorting;
- conjunctive facets + numeric stats;
- empty-query browsing;
- query-time synonyms;
- highlight/snippet capability handling;
- hydration without N+1;
- opt-in exact totals + default `hasMore`;
- diagnostics mode without sensitive values.

### Gate

- Tier A FTS5 semantics pass on Bun;
- no compiled statement exceeds a known runtime budget silently;
- totals are not computed unless requested/defined;
- hydration preserves rank and source-ID types.

---

## Phase 7 — Cloudflare D1 adapter and real-runtime conformance (`P7-*`)

### Deliverables

- `@siftlite/d1` adapter;
- D1 runtime-limit profile/probes;
- D1 database/session-like execution target;
- consistency metadata for transactions, sessions, sequential reads, replica eligibility;
- Workers Vitest integration test project;
- D1 migration examples;
- optional remote D1 smoke/cost suite;
- virtual-table export caveat documentation.

### Gate

- shared conformance runs inside Workers runtime, not a mock;
- parameter/function/statement budgets are enforced before invalid D1 calls;
- session/bookmark path has tests matching declared consistency behavior;
- BigInt/unsafe IDs fail before lossy binding;
- D1 fuzzy remains disabled by default.

---

## Phase 8 — libSQL adapter (`P8-*`)

### Deliverables

- `@siftlite/libsql` adapter against a minimal client-like interface;
- local/remote compatibility fixtures;
- transaction/batch capability mapping;
- shared FTS5 conformance;
- migration examples.

### Gate

- Tier A claimed semantics pass on libSQL local;
- optional remote smoke passes when credentials exist;
- core does not import `@libsql/client` concrete classes.

---

## Phase 9 — Portable Arabic normalization (`P9-*`)

### Deliverables

- index-level normalizer contract;
- conservative `arabic-basic` JS implementation;
- deterministic SQL expression compiler;
- JS/SQL equivalence corpus across Bun, D1 Workers runtime, and libSQL;
- mixed Arabic/English and combining-mark fixtures;
- parser-vs-backend-tokenizer documentation/tests.

### Gate

- JS/SQL linked-mode outputs are identical for the accepted transform set;
- no unproven generic NFC/NFKC dependency;
- default transformations remain conservative and enumerated.

---

## Phase 10 — Drizzle integration (`P10-*`)

### Deliverables

- ORM metadata -> canonical SiftLite schema mapper;
- `defineDrizzleIndex` typed inference;
- migration generation;
- batched hydration;
- D1/libSQL examples and type fixtures.

### Gate

- core never imports Drizzle internals;
- unsupported scalar/storage mappings fail clearly;
- ORM CRUD and raw SQL both stay synchronized through DB triggers.

---

## Phase 11 — Prisma integration (`P11-*`)

### Deliverables

- canonical search service;
- deterministic companion SQL migrations;
- optional Client Extension ergonomics;
- hydration and version compatibility fixtures.

### Gate

- no FTS virtual model or Prisma query-hook synchronization requirement;
- supported versions/types are explicit;
- trigger ownership is proven through CRUD/raw SQL tests.

---

## Phase 12 — Bounded typo-tolerant fallback (`P12-*`)

### Deliverables

- optional trigram companion;
- Unicode code-point gram generator;
- bounded OR/overlap candidate compiler;
- overlap threshold + candidate cap;
- Damerau-Levenshtein scorer;
- exact-first merge policy;
- D1 cost policy/benchmark evidence.

### Gate

- short (<3-code-point) tokens never enter trigram FTS fallback;
- candidate cap is never exceeded;
- exact/prefix hits are not displaced by weaker fuzzy hits under the default policy;
- 100k and local 1m reports exist;
- D1 enablement requires explicit policy plus acceptable measured evidence.

---

## Phase 13 — CLI and operational UX (`P13-*`)

### Deliverables

`@siftlite/cli` commands:

```text
siftlite init
generate
check
doctor
backfill
rebuild
merge
optimize
drop
```

with dry-run, JSON output, explicit destructive flags, operation IDs/status, and portable Node-compatible implementation that also runs under Bun.

### Gate

- CI can run `siftlite check` non-interactively;
- destructive operations require explicit acknowledgement;
- source tables are never dropped by SiftLite cleanup;
- failed/partial work remains diagnosable.

---

## Phase 14 — v1.0 RC hardening and dogfood (`P14-*`)

### Deliverables

- full compatibility matrix;
- package/public API freeze review;
- security/dependency audit;
- executable examples;
- 1m local benchmark characterization;
- D1 remote benchmark report where credentials/budget allow;
- real application dogfood;
- upgrade/migration/recovery docs;
- release candidate.

### v1.0 gate

Every v1 claim in `00-FINAL-REVIEW.md`, every required suite in `09-TESTING-AND-BENCHMARKS.md`, and every P0–P14 mandatory task is PASS. Experimental Turso-native code is excluded from stable promises unless it independently graduates.

---

## Phase 15 — Turso-native graduation (`P15-*`, v1.x)

This phase is conditional, not required for v1.0.

### Graduation prerequisites

- required upstream FTS/index-method behavior is no longer considered experimental for the intended stable package contract, **or** SiftLite continues to label the package experimental;
- native compiler/runtime/lifecycle conformance passes;
- migration and post-commit visibility semantics are tested against current upstream behavior;
- no public API changes are needed to support it.

### Gate

Only after the prerequisites pass may `@siftlite/turso` be documented as stable.

---

## Explicitly forbidden before v1.0

- custom inverted index or FST typo dictionary;
- distributed nodes/replicas/shards managed by SiftLite;
- HTTP search server/dashboard;
- vectors/embeddings/hybrid search;
- learning-to-rank;
- Meilisearch wire/API compatibility;
- arbitrary public scalar-codec plugin system;
- universal zero-downtime rebuild promise.
