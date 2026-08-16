# Architectural Decision Records

All decisions are **Accepted** unless marked **Deferred**.

## ADR-001 — Product is a search layer, not an FTS5 wrapper

**Decision:** The public API exposes application-search concepts. FTS5 is one backend.

**Reason:** D1 uses SQLite FTS5 while Turso Database has a distinct Tantivy-powered FTS implementation. A backend-neutral contract preserves portability and product value.

---

## ADR-002 — Separate runtime adapters from search backends

**Decision:** SQL execution and search semantics are independent abstractions.

**Reason:** D1/libSQL/Bun differ in execution/batching/runtime behavior, while FTS5/Turso differ in search syntax, maintenance, and scoring semantics.

---

## ADR-003 — Canonical API is ORM-independent

**Decision:** `engine.index(definition).search()` is canonical. Drizzle/Prisma are optional ergonomic layers.

**Reason:** ORM churn must not destabilize the engine or exclude raw SQLite/D1 users.

---

## ADR-004 — Database triggers maintain linked FTS5 indexes

**Decision:** Linked-mode synchronization uses database triggers, not required ORM hooks.

**Reason:** Correctness must survive raw SQL, migrations, scripts, and mixed data-access paths.

---

## ADR-005 — Portable v1 source IDs are string or safe integer

**Decision:** The portable v1 source-ID contract is `string | safe-integer number`. String IDs are stored as `TEXT`; numeric IDs as `INTEGER`. Internal FTS `rowid` uses a surrogate integer `doc_id`.

**Rejected for portable v1:** non-STRICT `ANY`, `bigint`, BLOB IDs, and composite linked IDs.

**Reason:** Application IDs may be UUID/text. SQLite affinity can coerce values stored in ordinary `ANY` columns, and D1's JS binding does not currently support BigInt even though the database can store 64-bit integers. Safe integer + text provides predictable cross-runtime semantics.

---

## ADR-006 — Default FTS5 table is contentful, not external-content

**Decision:** Use a regular contentful FTS5 table plus an internal document/projection table by default.

**Reason:** Simpler updates/deletes, predictable highlighting content, fewer external-content consistency pitfalls, and no public-ID coupling to FTS rowids.

**Deferred optimization:** external-content mode for compatible integer-key schemas only if benchmarks justify the complexity.

---

## ADR-007 — Search metadata is projected into internal tables

**Decision:** Duplicate only declared filter/sort/facet data required by search. In manual mode, the document table additionally preserves authoritative searchable document data needed to rebuild FTS.

**Reason:** Avoid repeated source-table scans/joins and ensure manual derived index state is reconstructible.

---

## ADR-008 — Plain user text is parsed, never treated as raw backend grammar

**Decision:** Ordinary search builds a query AST and backend emitter escapes literals/operators.

**Reason:** SQL parameterization alone does not prevent FTS/Tantivy query-language injection.

---

## ADR-009 — Raw backend query is separate and explicitly unsafe/non-portable

**Decision:** Advanced raw syntax uses a branded/namespaced `searchRaw` path.

**Reason:** Preserve an escape hatch without weakening the ordinary safe API.

---

## ADR-010 — Linked-mode normalization is index-level and dual-compiled

**Decision:** v1 linked-mode normalization is configured per logical index. Portable normalizers implement deterministic JavaScript and SQL forms.

**Reason:** A single query-normalization profile avoids field-dependent query-plan explosion and permits trigger-side normalization without callbacks.

**Constraint:** Generic NFC/NFKC normalization is not assumed available in SQLite SQL. A transform without a proven portable SQL form is manual-mode-only or rejected for linked mode.

---

## ADR-011 — Conservative Arabic normalization is default

**Decision:** `arabic-basic` consists only of an explicitly enumerated finite set of removals/replacements that can be compiled identically to JS and SQL: tatweel/common harakat removal plus selected alef/alif-maqsura normalization.

**Not default:** `ة -> ه`, `ؤ -> و`, `ئ -> ي`, implicit digit conversion, generic presentation-form/NFKC normalization.

**Reason:** Preserve precision and maintain cross-runtime equivalence.

---

## ADR-012 — Synonyms are query-time in v1

**Decision:** Synonym changes do not require reindexing.

**Reason:** Operational simplicity and fast configuration changes.

---

## ADR-013 — Typo tolerance is a bounded fallback

**Decision:** Exact/prefix search first; optional bounded trigram candidates plus application-side Damerau-Levenshtein reranking when the effective capability/policy permits it.

**Reason:** Rebuilding Meilisearch's FST/automata architecture is out of v1 scope.

---

## ADR-014 — Fuzzy fallback is policy-gated on D1

**Decision:** D1 fuzzy fallback is disabled by default until cost/performance benchmarks justify a different default.

**Reason:** Broad candidate/facet queries can amplify rows read and execution cost.

---

## ADR-015 — Relevance scores are backend-local and nullable

**Decision:** Guarantee ordering semantics, not numerical score parity. Public score is `number | null`; `null` is used when relevance is not computed, such as empty-query/field-only browsing.

**Reason:** Backends use different scales and some query modes have no meaningful relevance score.

---

## ADR-016 — Drizzle is the deepest v1 ORM integration

**Decision:** Provide schema inference and typed index definition for Drizzle through supported/public metadata surfaces.

**Reason:** Its runtime TypeScript schema and SQL-oriented design make robust integration practical.

---

## ADR-017 — Prisma uses companion SQL and optional Client Extension

**Decision:** Do not model FTS virtual tables in Prisma schema or use Prisma hooks for sync. Provide a canonical service plus optional Client Extension methods.

**Reason:** ORM ergonomics and search-state ownership are separate responsibilities.

---

## ADR-018 — Core is edge/runtime agnostic

**Decision:** No Node/Bun/D1/ORM imports in `core`.

**Reason:** Same search contract must compose with Workers, Bun, Node-compatible runtimes, and future adapters.

---

## ADR-019 — Migration-first schema management and maintenance-mode rebuilds

**Decision:** Generate and inspect migration plans; avoid implicit production DDL during normal startup. In v1, create/rebuild is treated as a maintenance/offline operation unless atomic concurrent behavior is explicitly proven for that adapter/backend pair.

**Reason:** Search schema changes are stateful and can be destructive or non-atomic on remote runtimes. Zero-downtime rebuilds are not a v1 promise.

---

## ADR-020 — Conformance tests enforce, but do not redefine, accepted contracts

**Decision:** Every supported adapter/backend/integration passes shared tests. Accepted ADRs/normative specifications remain the authority when a test and contract conflict.

**Reason:** Tests are executable specification, but an accidental test must not silently overturn architecture.

---

## ADR-021 — Native Turso FTS is a separate backend

**Decision:** Native Turso `CREATE INDEX ... USING fts` / `fts_match` / `fts_score` semantics are compiled independently from FTS5.

**Reason:** Native Turso FTS is Tantivy-powered and differs in DDL, tokenizer options, maintenance, snippet support, and transaction visibility.

---

## ADR-022 — Vector/hybrid search is deferred

**Status:** Deferred.

**Reason:** Keyword application search and index lifecycle must stabilize first.

---

## ADR-023 — Composite and nonportable source IDs are deferred

**Status:** Deferred.

**Includes:** composite linked keys, arbitrary BLOB IDs, BigInt source IDs, and custom ID codecs.

**Reason:** String + safe integer covers the initial portable majority without precision/coercion ambiguity.

---

## ADR-024 — No HTTP server/dashboard in core product

**Decision:** Library/CLI first.

**Reason:** Deployment simplicity is a core differentiator.

---

## ADR-025 — Manual document storage is authoritative; manual FTS is derived

**Decision:** Manual mode stores enough source/searchable/metadata document state in a normal internal table to rebuild all derived FTS structures without reading from the potentially corrupted FTS index.

**Reason:** A derived index cannot be its own only recovery source.

---

## ADR-026 — Logical definition hash and physical schema hash are distinct

**Decision:** Keep a logical `definition_hash` and backend-produced `physical_schema_hash`/version. Backend physical manifests classify runtime-only, migration-only, and rebuild-required changes.

**Reason:** FTS5 query-time weights need not rebuild an index, while another backend may encode weights physically. Core must not impose one backend's migration semantics on another.

---

## ADR-027 — Effective capabilities are an intersection, not a static backend list

**Decision:** Effective capabilities are derived from backend semantic support, adapter/runtime support, runtime probes, and application policy.

**Reason:** FTS5 tokenizer availability, batch/cancellation behavior, read-your-writes, and D1 fuzzy policy are not accurately represented by backend identity alone.

---

## ADR-028 — v1 facet and NULL semantics are intentionally simple

**Decision:** Facets are conjunctive: they use the same query and full filter set as hits, including a filter on the facet field itself. NULL values are excluded from v1 facet buckets. `neq`, `notIn`, and range operators follow SQL NULL behavior and therefore do not match NULL; use `isNull`/`isNotNull` explicitly.

**Reason:** Deterministic portable semantics are preferable to hidden disjunctive-facet magic.

---

## ADR-029 — Published CLI is not Bun-runtime-only

**Decision:** Bun is the repository/package/test toolchain. The published CLI should use standard Node-compatible APIs and also run under Bun unless an explicit later decision changes that support policy.

**Reason:** D1/Prisma/Node users should not need Bun merely to generate or inspect search migrations.

---

## ADR-030 — Turso-native pressure test happens before v1 API freeze

**Decision:** Build an experimental/internal Turso-native architecture spike before v1 hardening, but do not require it to be a stable v1 backend.

**Reason:** A second materially different backend is the best check that public/core abstractions are not accidentally FTS5-specific.

---

## ADR-031 — Runtime SQL limits are first-class effective capabilities

**Decision:** Effective runtime state includes numeric SQL/resource limits in addition to feature booleans. Query compilers reserve budget before expanding filters, ranking arguments, synonyms, facets, and hydration lists.

**Reason:** Hosted runtimes such as D1 have finite per-query bind/function/statement/duration limits. A global `maxInValues` alone cannot guarantee a legal query.

---

## ADR-032 — Portable fields use canonical built-in scalar codecs

**Decision:** v1 maps declared fields to `text`, `safe-integer`, `finite-real`, `boolean-integer`, or explicit integer timestamp storage. Arbitrary/custom codecs are deferred.

**Reason:** TypeScript/ORM value representations must not produce ambiguous SQLite storage/coercion behavior.

---

## ADR-033 — Physical index identity is independent of definition hashes

**Decision:** The registry owns a stable `physical_index_id` and explicit generation. `definition_hash` and backend physical-manifest hashes are drift/version descriptors, not physical object names.

**Reason:** Runtime-only logical edits must not rename tables; rebuilds need generation semantics without changing logical identity.

---

## ADR-034 — Fuzzy trigram retrieval uses explicit Unicode n-gram overlap

**Decision:** Fuzzy fallback generates contiguous three-Unicode-code-point grams, retrieves a bounded overlap candidate set, then applies Damerau-Levenshtein. It never treats a misspelled full token as an approximate FTS query.

**Reason:** FTS5 trigram is a substring/gram index, not an edit-distance engine; short-token behavior and candidate growth must be explicit.

---

## ADR-035 — FTS search deletion and forensic erasure are distinct

**Decision:** Normal delete guarantees search invisibility after write visibility. FTS5 secure-delete is an optional/probed policy; provider backups/time travel and stronger file forensics are outside the portable guarantee.

**Reason:** Default FTS5 deletion may leave old index entries until merge, and hosted storage lifecycle is not controlled by SiftLite.

---

## ADR-036 — Shared-database tenant scopes are immutable predicates

**Decision:** A bound application/tenant scope is compiler-owned and ANDed outside the user filter AST across hits, facets, totals, fuzzy candidates, and hydration.

**Reason:** Tenant isolation must not depend on every caller remembering a filter or on an AST that can negate/remove the isolation predicate.

---

## ADR-037 — Read consistency is distinct from transaction capability

**Decision:** Model transaction read-your-writes, post-commit read-your-writes, session awareness, sequential session consistency, and read-replica eligibility separately.

**Reason:** D1 Sessions/bookmarks solve a different problem from a local SQL transaction, especially with read replication.

---

## ADR-038 — Long FTS maintenance is budgeted/incremental by default

**Decision:** The portable maintenance contract exposes bounded merge/incremental optimization. Full optimize is backend/runtime-specific and not assumed safe on remote runtimes.

**Reason:** FTS5 full optimize can reorganize the entire index and exceed hosted-runtime operational budgets.

---

## ADR-039 — Migration-only projected fields require verified backfill lifecycle

**Decision:** Adding projected filter/sort/facet data requires preparation, existing-row backfill, indexes, trigger regeneration, invariant verification, then registry update.

**Reason:** It is a data migration, not only DDL; marking success before backfill creates silently incorrect search/filter state.

---

## ADR-040 — D1 conformance runs in the Workers runtime

**Decision:** `@siftlite/d1` is tested with Cloudflare's Workers Vitest integration plus optional remote smoke tests. Bun SQLite mocks are insufficient evidence.

**Reason:** Runtime/binding behavior is part of the adapter contract.

---

## ADR-041 — Turso-native architecture pressure testing is early; stability is upstream-gated

**Decision:** Run the Turso-native compiler/manifest pressure spike immediately after the FTS5 proof. The package remains experimental while its required upstream FTS/index-method contract is experimental.

**Reason:** A second backend catches FTS5-shaped abstractions cheaply, while SiftLite cannot unilaterally stabilize an upstream experimental API.

---

## ADR-042 — Exact hit totals are opt-in

**Decision:** Default pagination returns bounded hits plus `hasMore`. Exact `totalHits` requires an explicit request; estimated totals require documented backend semantics.

**Reason:** Hidden count queries add latency/cost, especially on remote SQLite runtimes.

---

## ADR-043 — Portable query parsing is separate from backend lexical analysis

**Decision:** Core parses application intent into a safe AST but does not claim to clone FTS5/Tantivy tokenization. Backend analyzers retain lexical token-boundary semantics.

**Reason:** Pretending a JavaScript tokenizer is identical to upstream analyzers creates subtle Unicode/punctuation mismatches.
