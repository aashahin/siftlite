# Final Review and Go/No-Go Decision

> Historical decision record (2026-08-16). Implementation has since shipped at
> `0.1.0`. This file preserves intended contracts; it is not evidence that every
> contract is implemented. See `15-CODE-DOCS-AUDIT.md`.

## Decision

**GO — SiftLite v1.2 is approved for implementation.**

The v1.2 pack closes the pre-implementation gaps that could otherwise force a core API redesign during D1, fuzzy-search, migration, or Turso-native work. The project remains scoped as application-search infrastructure for SQLite-family databases, not as a distributed search engine or a Meilisearch clone.

## Overall assessment after v1.2

| Dimension | Assessment | Notes |
|---|---:|---|
| Technical feasibility | 9/10 | FTS5 supplies the core lexical index; SiftLite supplies application semantics, lifecycle, portability, and integrations. |
| Architecture | 9.5/10 | Adapter/backend separation now includes limits, consistency, codecs, scopes, and physical generations. |
| Implementation readiness | 9.5/10 | Remaining uncertainty is implementation validation, not an unresolved core contract. |
| Open-source usefulness | 9/10 | Strong fit for SQLite/D1/libSQL applications avoiding a separate search service. |
| Arabic-search differentiation | 9/10 | Conservative portable normalization plus explicit fuzzy fallback is a useful niche. |
| Scope-explosion risk | High | Must keep vectors, distributed search, custom inverted indexes, and Meilisearch parity out of v1. |

## Canonical product statement

> **SiftLite provides typed application search where SQLite-family application data already lives.**

A consumer with an index handle should be able to write a portable request
such as:

```ts
const result = await index.search("ايفون برو", {
  filter: and(eq("status", "active"), lte("price", 50_000)),
  facets: ["brand", "category"],
  limit: 20,
});
```

without writing FTS5 `MATCH`, Turso `fts_match`, unsafe SQL fragments, or ORM synchronization hooks.

## v1.2 closure decisions

### 1. Runtime constraints are part of the contract

The engine does not model runtime support only as booleans. Effective runtime information includes SQL budgets such as maximum bind parameters, function arguments, statement size, query duration, and runtime-specific restrictions. Query compilation must reserve parameter budget for search, filters, pagination, facets, and hydration before expanding `IN` lists or synonyms.

### 2. Portable scalar values are explicit

v1 supports canonical storage kinds rather than accepting arbitrary JavaScript values:

```text
string         -> TEXT
safe integer   -> INTEGER
finite number  -> REAL
boolean        -> INTEGER 0/1
explicit timestamp codec -> declared INTEGER representation
```

`bigint`, Decimal, BLOB, JSON/object values, NaN, Infinity, and implicit Date guessing are rejected by the portable v1 core unless a later accepted codec contract adds them.

### 3. Fuzzy search has a defined algorithm

The trigram companion is not queried with the misspelled token as though it were approximate search. The planner:

1. normalizes candidate tokens;
2. measures token length in Unicode code points;
3. builds bounded contiguous 3-code-point grams;
4. compiles a bounded OR/overlap retrieval query;
5. requires a minimum gram-overlap threshold;
6. caps candidates before reading larger text payloads;
7. applies application-side Damerau-Levenshtein;
8. merges fuzzy hits behind exact/prefix hits.

Queries/tokens too short for trigram retrieval never enter this path.

### 4. Deletion has two semantics

`delete()` guarantees that a document no longer appears in normal search after the write becomes visible. It does **not** by itself promise forensic erasure from database pages/backups. FTS5 secure-delete is a separate policy/capability and must be probed/version-gated. Platform backups/time-travel remain outside a local FTS deletion guarantee.

### 5. Maintenance is budgeted

Full FTS5 `optimize` may be expensive. The portable operational primitive is budgeted/incremental maintenance. A backend may expose full optimize only when the runtime can safely support it; remote runtimes may implement optimization as bounded merge steps.

### 6. D1 consistency is modeled explicitly

Transaction behavior, post-commit read-your-writes, D1 Sessions/bookmarks, and read-replica eligibility are distinct. An adapter may wrap a database/session execution target. SiftLite never assumes read replication provides current reads without a consistency mechanism.

### 7. Physical identity is stable across logical edits

`definition_hash` detects logical configuration drift; it does not name physical objects. Internal objects use a stable `physical_index_id` plus a `generation`. Rebuilds can create a new generation without changing logical identity. Runtime-only definition edits do not invent new table names.

### 8. Migration-only projected fields include data work

Adding a filter/sort/facet projection is not only DDL. The migration plan must add/prepare storage, backfill existing rows in bounded chunks where necessary, add B-tree indexes, regenerate triggers, verify invariants, and only then update the registry.

### 9. Shared SaaS scope is immutable

SiftLite may bind an engine/index handle to a mandatory scope predicate such as `tenant_id = ?`. User filters are ANDed beneath this scope and cannot negate/remove it. Hydration, facets, fuzzy candidates, and maintenance diagnostics that read documents must preserve the same scope contract where applicable.

### 10. D1 support is proven in Workers runtime

Bun tests cover portable core and local SQLite. D1 integration/conformance uses the Cloudflare Workers Vitest integration/workerd-compatible runtime, with optional remote D1 smoke tests for platform-specific behavior/cost metadata.

### 11. Turso pressure testing happens early

A small Turso-native compiler/manifest spike happens after the FTS5 proof and before deep lifecycle/API expansion. Its purpose is to catch FTS5-shaped abstractions cheaply. A full native backend remains experimental until later.

### 12. Stable Turso-native support has an upstream gate

If the native FTS mechanism still requires an upstream experimental feature flag at release time, `@siftlite/turso` remains experimental. Passing SiftLite's own tests cannot make an upstream experimental contract stable.

### 13. Exact totals are opt-in

The default search response does not require an exact `COUNT(*)`-style companion query. Consumers may request exact totals explicitly. `hasMore` is the default pagination signal. `estimatedTotalHits` may only be returned where the backend has a defined, tested meaning.

### 14. Parser and tokenizer responsibilities are separated

The portable query parser understands application intent such as phrases, prefix intent, term limits, synonyms, and AST operators. Backend lexical analyzers/tokenizers decide their own token boundaries. JavaScript code must not pretend to exactly emulate `unicode61` unless an explicit equivalence implementation is tested.

## Explicit non-goals for v1

- a distributed search cluster;
- Elasticsearch/Meilisearch wire/API compatibility;
- a custom inverted index or FST typo engine;
- vector/hybrid search;
- language-universal stemming;
- ranking-score parity across backends;
- zero-downtime rebuild promises on all runtimes;
- forensic deletion from provider backups/time-travel;
- arbitrary custom scalar codecs in the first stable portable contract.

## Implementation entry criteria

Phase 0 may begin only from this v1.2 pack. The coding agent must treat `12-ADRS.md` as normative, `14-IMPLEMENTATION-TASKS.md` as the execution backlog, and `09-TESTING-AND-BENCHMARKS.md` as the evidence contract.

**Final decision: implement SiftLite.**
