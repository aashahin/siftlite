# Coding Agent Execution Guide

## Mission

Implement the project defined by this v1.2 documentation pack as a production-grade open-source TypeScript monorepo.

This document controls **workflow**. Accepted ADRs and normative product/architecture contracts control **architecture and behavior**. Conformance tests are the executable enforcement of those contracts and must not silently redefine them.

## Source-of-truth order

When sources conflict:

1. accepted ADRs in `12-ADRS.md`;
2. explicit normative contracts in `01-PRODUCT-SCOPE.md` through `08-SECURITY-RELIABILITY-MAINTENANCE.md`;
3. roadmap phase acceptance criteria;
4. conformance/type/security tests that encode the above contracts;
5. implementation comments;
6. assumptions.

If an existing test contradicts an accepted contract, do not simply follow the test. Diagnose the inconsistency, fix the test or propose an explicit ADR/spec change, then preserve the decision in regression coverage.

## Working behavior

1. Read every document before writing code.
2. Inspect repository and branch state before each phase.
3. Work one roadmap phase at a time.
4. Before modifying code, state phase objectives and exact exit tests.
5. Write/update tests with each behavior; never postpone testing to project end.
6. Run the smallest relevant tests after each coherent change and the full phase gate before reporting PASS.
7. Never skip a failing test because code “looks correct.”
8. Never silently weaken acceptance criteria. Upstream limitations become documented capability differences.
9. Do not publish packages/releases until branding/package scope is finalized by the owner.
10. Keep commits small and phase-oriented when Git is available.
11. Do not mix unfinished work from a later phase into an earlier phase's PASS report.

## Mandatory engineering constraints

### TypeScript and public types

- strict mode;
- avoid `any`; justify unavoidable local escape hatches;
- no unchecked casts in public API paths;
- discriminated unions for AST/error states;
- public exported types documented;
- no Node/Bun-specific types in `core`;
- portable v1 source ID type is `string | number`, where numeric IDs must be finite safe integers;
- reject `bigint`, unsafe integers, BLOB IDs, and composite linked IDs unless a later accepted codec contract explicitly supports them.

### Runtime boundaries

- Bun workspaces, scripts, and `bun:test` are the repository toolchain;
- `core` remains Web/edge-safe;
- runtime imports stay inside adapters/tooling packages;
- no hidden global mutable singleton engine;
- do not make the published CLI Bun-only: prefer standard Node-compatible APIs that also run under Bun unless an accepted ADR changes this.

### SQL

- values always parameterized;
- identifiers centrally validated and quoted;
- no end-user request input as an identifier;
- raw FTS/Tantivy syntax separated from ordinary search;
- generated DDL deterministic;
- no broad `IF NOT EXISTS` usage that hides schema drift;
- never use non-STRICT `ANY` as the portable source-ID storage type;
- use `TEXT` for string IDs and `INTEGER` for safe-integer IDs.

### Normalization

- v1 linked-mode normalization is index-level;
- a linked-mode normalizer must implement deterministic JS and SQL forms;
- do not assume SQLite SQL has generic NFC/NFKC normalization;
- `arabic-basic` must be an explicit finite transform set with equivalence fixtures;
- a transform that cannot compile portably to SQL is manual-mode-only or rejected for linked mode.

### Index consistency

- linked mode uses DB triggers;
- ORM hooks are never required for correctness;
- create-index backfills existing rows;
- source primary-key changes are handled explicitly and tested;
- manual mode stores authoritative document data independent of the FTS index;
- registry/manifest health is recorded only after verification;
- rebuild verifies postconditions before declaring success.

### Lifecycle and migration safety

- v1 create/rebuild is a maintenance operation unless exact adapter/backend atomicity and concurrency semantics are proven;
- do not claim zero-downtime rebuilds;
- logical definition hash and backend physical-schema hash are distinct concepts;
- migration classification comes from a backend-generated physical manifest;
- a logical config change that does not change an FTS5 physical manifest must not be forced into a rebuild merely because the global definition hash changed.

### Effective capabilities

Do not read a backend's static feature list as the final truth. Resolve effective capabilities from:

1. backend semantic support;
2. runtime/adapter capabilities;
3. startup/doctor probes;
4. application policy (for example D1 fuzzy fallback disabled by default).

Never scatter `if (adapter.id === "d1")` feature behavior through core when a capability/policy can represent it.

### Performance

- no per-document remote round-trip in bulk paths;
- no per-hit ORM hydration query;
- fuzzy/synonym/filter/facet expansion bounded;
- avoid premature micro-optimization before correctness benchmarks;
- do not enable expensive D1 fuzzy behavior by default without measured evidence.

## Required first implementation session

The first coding session begins with **Phase 0 only**.

Deliver Phase 0, run `bun run verify`, and produce a complete Phase 0 report. If Phase 0 is PASS and sufficient context remains, the same session may then begin Phase 1 as a separate unit of work with a separate report. Do not interleave Phase 1 implementation into an unverified Phase 0.

### Phase 0 deliverables

- workspace root files;
- `packages/core`;
- `packages/fts5` (`@siftlite/fts5`);
- `packages/bun` (`@siftlite/bun`);
- `packages/testkit`;
- build/test scripts;
- CI;
- no fake placeholder implementation advertised as complete.

## Phase completion report template

```text
Phase: <number/name>
Status: PASS | PARTIAL | BLOCKED

Implemented:
- ...

Tests added:
- ...

Commands run:
- ...

Results:
- unit: x passed / x failed
- conformance: ...
- typecheck: ...
- build: ...

Acceptance criteria:
- [x] ...
- [ ] ...

Known limitations / follow-ups:
- ...

Git state:
- branch/commit or uncommitted file list
```

Never report PASS with an unchecked acceptance criterion.

## Architectural decision questions

Before adding a consequential dependency/abstraction, ask:

1. Is this part of the public product contract?
2. Is it portable across the targeted runtime set?
3. Is it core, backend, adapter, integration, or tooling responsibility?
4. Is there a test or second-backend pressure case proving the abstraction is needed?
5. Does the design make Turso-native implementation impossible or awkward?
6. Does it increase consistency/migration risk?
7. Does it blur authoritative source data and derived index state?

If uncertain, choose the smaller internal implementation. Record a new ADR only when the choice is consequential and durable.

## Upstream documentation verification

Before implementing version-sensitive behavior, re-check current official documentation/release notes for:

- SQLite FTS5 and STRICT typing semantics;
- Bun SQLite;
- Cloudflare D1 Worker API, SQL support, limits, pricing, migrations, import/export;
- Drizzle;
- Prisma;
- libSQL/Turso Cloud;
- Turso Database native FTS.

Do not implement from memory when an upstream API or platform capability may have changed.

## Testing discipline

For every bug:

1. reproduce with a failing regression test;
2. fix the behavior;
3. run the relevant conformance matrix;
4. keep the regression test unless a stronger property test supersedes it.

For every backend-specific difference:

1. represent it in capabilities/policy/physical manifest as appropriate;
2. add behavior tests;
3. document it;
4. do not add scattered backend-name conditionals in core.

## Benchmark discipline

When a path appears slow:

- capture query plan where available;
- record dataset size and result count;
- measure before/after;
- keep the reproduction command;
- preserve correctness assertions.

Never add README marketing performance claims from one-off local measurements.

## Security review checklist per phase

- Are all values bound?
- Can ordinary user text create backend query operators?
- Can request field names become identifiers?
- Can request expansion grow without a hard cap?
- Does logging expose raw queries/filter values?
- Can formatted text be mistaken for safe HTML?
- Can a failed migration leave registry state falsely healthy?
- Can an ID be coerced or lose integer precision across an adapter boundary?
- Can a manual index be rebuilt without trusting potentially corrupted FTS state?

## Do not do these things

- Do not write a custom inverted index.
- Do not add Redis/queues/external workers for linked FTS synchronization.
- Do not couple core to Drizzle or Prisma.
- Do not require ORM hooks for synchronization.
- Do not use a custom native tokenizer as a v1 portability requirement.
- Do not require generic Unicode normalization from SQLite SQL.
- Do not implement vector search before v1.
- Do not execute destructive schema changes silently at application startup.
- Do not enable fuzzy fallback automatically on D1 before cost benchmarks.
- Do not use FTS itself as the sole authoritative manual document store.
- Do not publish packages under the working namespace.

## Definition of done

The project is v1-ready only when the v1.0 gate in `10-IMPLEMENTATION-ROADMAP.md` passes, all required examples are executable, the release candidate has been tested against a non-trivial real application schema, and current upstream limitations documented in `13-RESEARCH-SOURCES.md` have been re-verified.

## v1.2 mandatory hardening rules

1. Treat runtime SQL limits as data. Never hard-code “100 IN values works everywhere” into core.
2. Map values through canonical SiftLite storage kinds/codecs before SQL compilation.
3. Mandatory scopes are compiler-owned predicates, not user filter nodes.
4. Physical table identity must not be the current `definition_hash`; use stable physical ID + generation.
5. A projected-field migration includes backfill and trigger regeneration before registry success.
6. D1 adapter work is not PASS until Workers-runtime tests pass.
7. D1 read-replication consistency claims require Sessions/bookmark-aware behavior and tests.
8. FTS5 delete visibility is not forensic erasure; secure-delete is a separate policy/capability.
9. Prefer bounded merge/incremental maintenance on remote runtimes.
10. Fuzzy fallback must generate code-point trigrams and use bounded overlap retrieval before edit distance.
11. Do the Turso-native pressure spike in Phase 3; do not postpone it until API hardening.
12. Never mark `@siftlite/turso` stable solely because SiftLite tests pass while its required upstream contract remains experimental.
13. Exact totals are opt-in; do not add hidden count queries to ordinary search.
14. Distinguish the portable query parser from backend tokenization/analyzers.
