# SiftLite — Implementation Pack

Status: **Approved architecture for implementation after v1.2 hardening**  
Revision: **v1.2**  
Review date: **2026-08-16**  
Project name: **SiftLite** (`siftlite`)

> **SiftLite — typed application search for SQLite-family databases.**

SiftLite is a TypeScript-first application-search layer for SQLite, Cloudflare D1, and libSQL/Turso. It is deliberately **not** a thin FTS5 wrapper. The product contract is a stable, typed search API for full-text retrieval, filters, sorting, facets, Arabic normalization, optional bounded typo fallback (trigram + Damerau-Levenshtein, D1 off by default), ORM integration, and managed index lifecycle while keeping backend-specific query syntax behind explicit capabilities.

## Target package ecosystem

The package names below are the intended public shape. Do not publish empty packages merely to reserve names; create each package when its phase begins.

```text
siftlite                 convenience entrypoint after the core API stabilizes
@siftlite/core           public types, planner, ASTs, codecs, scopes
@siftlite/fts5           SQLite FTS5 backend
@siftlite/bun            bun:sqlite runtime adapter
@siftlite/d1             Cloudflare D1 runtime adapter
@siftlite/libsql         libSQL runtime adapter
@siftlite/drizzle        Drizzle integration
@siftlite/prisma         Prisma integration
@siftlite/cli            portable CLI
@siftlite/testing        conformance/testkit package
@siftlite/turso          experimental until its graduation gate passes
```

## v1.2 hardening changes

v1.2 closes the final architecture gaps identified before implementation:

1. runtime SQL **limits are first-class**, not hidden booleans or hard-coded constants;
2. public filter/sort/facet values use canonical **field codecs/storage kinds**;
3. the fuzzy fallback has an explicit bounded **Unicode trigram candidate algorithm**;
4. FTS5 deletion semantics distinguish search invisibility from **secure deletion/data remanence**;
5. long FTS maintenance uses **budgeted/incremental merge** rather than assuming full `optimize` is safe;
6. D1 consistency models **Sessions/bookmarks/sequential consistency** separately from transaction behavior;
7. internal physical identity is independent from logical definition hashes and uses explicit generations;
8. migration-only projected fields require an explicit **backfill + index + trigger regeneration** lifecycle;
9. shared-database SaaS deployments can use an **immutable tenant scope** that user filters cannot remove;
10. D1 conformance runs inside the **Cloudflare Workers runtime**, with optional remote smoke tests;
11. the Turso-native architecture pressure test moves early, before the implementation becomes FTS5-shaped;
12. Turso-native cannot graduate to stable while required upstream FTS behavior remains experimental;
13. exact hit totals are opt-in because they can require additional work on remote runtimes;
14. the portable query parser is distinguished from the backend lexical analyzer/tokenizer.

## Stable v1 contracts

- portable source IDs are `string | safe-integer number`;
- strings remain `TEXT`, safe integers remain `INTEGER`, and FTS uses an internal surrogate `doc_id`;
- core public values are limited to canonical portable scalar codecs in v1;
- linked indexes are maintained by database triggers, not ORM hooks;
- manual mode stores authoritative normal-table documents and treats FTS/trigram state as derived;
- ordinary user search text is parsed into a backend-neutral AST and is never raw FTS grammar;
- effective behavior is resolved from backend semantics ∩ runtime features ∩ runtime limits ∩ probes ∩ policy;
- physical migrations are decided by backend manifests, not by the logical definition hash alone;
- create/rebuild are maintenance operations unless stronger atomic/concurrent behavior is proven;
- relevance scores are backend-local and nullable; score parity across backends is not promised;
- no feature is considered supported until its conformance suite passes on the real runtime/backend pair.

## Read in this order

1. `00-FINAL-REVIEW.md` — final go/no-go and v1.2 closure criteria.
2. `01-PRODUCT-SCOPE.md` — public product/behavior contracts.
3. `02-ARCHITECTURE.md` — layers, packages, codecs, capabilities, limits, consistency, registry.
4. `03-INDEXING-AND-STORAGE.md` — linked/manual storage, identities, migration/backfill/rebuild.
5. `04-SEARCH-API-AND-QUERY-ENGINE.md` — query/filter API and compilation behavior.
6. `05-BACKENDS-AND-ADAPTERS.md` — FTS5, Bun, D1, libSQL, Turso-native boundaries.
7. `06-DRIZZLE-AND-PRISMA.md` — ORM companions.
8. `07-ARABIC-AND-TYPO-TOLERANCE.md` — Arabic normalization and bounded fuzzy fallback.
9. `08-SECURITY-RELIABILITY-MAINTENANCE.md` — tenant isolation, secure deletion, recovery, maintenance.
10. `09-TESTING-AND-BENCHMARKS.md` — real-runtime conformance and performance gates.
11. `10-IMPLEMENTATION-ROADMAP.md` — implementation phases and dependency order.
12. `11-AGENT-EXECUTION-GUIDE.md` — rules for coding agents.
13. `12-ADRS.md` — accepted architecture decisions.
14. `13-RESEARCH-SOURCES.md` — primary upstream references and version-sensitive facts.
15. `14-IMPLEMENTATION-TASKS.md` — executable task backlog with IDs and phase gates.
16. `AGENT-START-PROMPT.md` — handoff prompt for the implementing agent.

## Release recommendation

**Proceed with implementation.**

The public/core contracts are now sufficiently explicit to start Phase 0 without knowingly deferring a structural API problem. The roadmap deliberately front-loads the second-backend pressure test, runtime-limit modeling, scalar codecs, physical identities, and real D1 tests so later phases do not need to retrofit them.
