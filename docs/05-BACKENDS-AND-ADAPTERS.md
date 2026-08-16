# Backends and Runtime Adapters

## Support matrix target

| Runtime/database | Runtime adapter | Search backend | v1 target |
|---|---|---|---|
| Bun local SQLite | `@siftlite/bun` | `@siftlite/fts5` | Required |
| Cloudflare D1 | `@siftlite/d1` | `@siftlite/fts5` | Required |
| libSQL local/remote / Turso Cloud libSQL | `@siftlite/libsql` | `@siftlite/fts5` | Required |
| generic Node SQLite | future/community adapter | `@siftlite/fts5` | Post-core |
| Turso Database native engine | experimental `@siftlite/turso` | native Tantivy FTS | Pre-v1 pressure test; stable support post-v1 unless it passes full gate early |

The matrix distinguishes transport/runtime from search backend. A runtime/backend pair is supported only after its effective capability/conformance suite passes.

## FTS5 backend

### Base semantic capabilities

The FTS5 backend can target:

- FTS5 virtual tables and `MATCH`;
- BM25/hidden `rank` weighted ranking;
- prefix indexes;
- phrase queries;
- `highlight()`/`snippet()`;
- `fts5vocab` diagnostics where the runtime exposes it;
- regular SQLite filters/sort/aggregate facets;
- optional trigram-based candidate retrieval where the tokenizer is actually available.

These are **base** capabilities, not an unconditional promise for every runtime. Startup/doctor probes resolve the effective set.

### Tokenizer baseline

Default portable FTS tokenizer:

```text
unicode61
```

Optional/capability-gated:

- `porter unicode61` for explicitly English-oriented indexes;
- `trigram` companion table for substring/fuzzy candidate retrieval.

Do not make custom C/native tokenizers a v1 contract.

### Physical-manifest behavior

The FTS5 backend owns its physical manifest. Examples:

- searchable column/order/tokenizer/prefix changes can require rebuild;
- projected metadata/B-tree changes can be migration-only;
- query-time synonyms/limits/matching defaults are runtime-only;
- query-time BM25 weights should not force a rebuild merely because logical definition hash changed.

## Bun adapter

Use `bun:sqlite` directly.

Requirements:

- prepared statements;
- sync Bun API wrapped into async-compatible adapter contract;
- transaction support;
- batch/multi-statement behavior tested explicitly;
- no `bun:sqlite` imports outside the adapter package;
- FTS5 capability smoke test in CI.

Bun supports loading SQLite extensions, but the core product must not require dynamic extension loading.

## Cloudflare D1 adapter

D1 officially supports FTS5 and `fts5vocab`, but it has runtime/operational constraints that must be part of the adapter contract.

Requirements:

- use prepared statements and `.bind()`;
- use `batch()` where independent facet/bulk operations benefit;
- no filesystem assumptions;
- local adapter/backend conformance runs through Cloudflare Workers Vitest integration / Workers runtime rather than substituting desktop SQLite;
- optional remote release smoke uses a dedicated test database;
- benchmark tooling captures rows-read/rows-written metadata when available;
- migrations integrate with D1 migration workflows rather than implicit startup DDL;
- adapter validates numeric IDs as finite safe integers before binding.

### D1-specific cautions

- D1 stores 64-bit SQLite INTEGER values internally, but its current Worker JS API does not support `BigInt`; portable v1 numeric IDs therefore stop at `Number.MAX_SAFE_INTEGER`.
- database/serverless limits make huge monolithic indexes a separate scaling concern;
- broad facets/fuzzy/offset scans can increase rows read;
- fuzzy fallback is disabled by default until D1-specific cost benchmarks justify otherwise;
- create/rebuild should be treated as a maintenance operation unless stronger atomic/concurrent behavior is explicitly proven.

### D1 export/backup caveat

Current D1 export does not support databases containing virtual tables, including FTS5. Operational documentation must explain the supported workaround at the time of implementation: remove derived virtual search tables, export the authoritative database state, then recreate/rebuild search structures.

Because linked indexes are derived from source tables, the search layer must never force users to treat FTS virtual tables as the only backup copy. Manual-mode authoritative document tables are normal tables and must be included in backups.

## libSQL adapter

Use `@libsql/client` for the v1 libSQL/Turso Cloud adapter because it is production-ready and broadly ORM-compatible.

Requirements:

- support local `file:` for tests;
- support remote libSQL URL;
- use batch API where available;
- network-safe bulk indexing;
- compatibility suite on local libSQL plus optional remote release smoke test;
- preserve declared string/safe-integer source-ID types without hidden coercion.

Do not label this adapter “Turso native FTS.” It is the libSQL/FTS5 path.

## Cloudflare D1 runtime contract

The D1 adapter must expose current platform limits as runtime data/probes rather than scattering constants through core. At the v1.2 review, official D1 documentation lists important per-query constraints including a finite bind-parameter limit, SQL-function argument limit, statement-size limit, pattern-size limit, and query-duration limit. These values must be revalidated at implementation/release time.

The compiler must therefore budget parameters for search + scope + filters + pagination + facets and chunk/reject before the D1 API receives an invalid statement.

### D1 Sessions and consistency

Support an execution target abstraction compatible with a normal `D1Database` and a session-like target. Model separately:

- whether an active transaction sees its own writes;
- whether post-commit reads are guaranteed current;
- whether the target is session-aware;
- whether sequential consistency/bookmark continuation is available;
- whether reads may use replicas.

When D1 read replication is used, the application must be able to pass/use a Sessions API target/bookmark strategy to obtain the documented sequential-consistency behavior. SiftLite must never imply that a plain read-replica path automatically provides read-your-writes.

### D1 testing

D1 adapter conformance runs in Cloudflare's Workers Vitest integration (Workers runtime), not only against `bun:sqlite` or a hand-written mock. Optional remote smoke tests validate platform metadata, limits that cannot be faithfully emulated, and cost/rows-read behavior.

## Turso Database native FTS backend

Turso Database now exposes Tantivy-powered FTS with syntax such as:

```sql
CREATE INDEX idx_articles ON articles USING fts (title, body);
```

and search functions such as:

```sql
fts_match(...)
fts_score(...)
fts_highlight(...)
```

Important semantic differences from FTS5 include:

- different tokenizer names and behavior;
- no `MATCH` operator;
- no native snippet function currently;
- segment maintenance via `OPTIMIZE INDEX`;
- FTS changes are visible after commit, not as read-your-writes within the same transaction.

Therefore implement it as a distinct backend.

### Native Turso implementation strategy

Do not force the FTS5 physical model onto Turso native. It owns a separate physical-manifest compiler and may index source/projection columns directly where appropriate.

The backend may choose its own physical model while preserving:

- logical index definition;
- portable source-ID contract;
- filters/sort/facets;
- search response contract;
- capability reporting.

Use the experimental implementation to pressure-test the abstractions before locking v1 internal interfaces.

## Adapter feature detection

Each adapter/backend pair performs startup/doctor probes as needed. Ordinary requests use cached/resolved results rather than probing per search.

Illustrative runtime probe:

```ts
{
  sqliteVersion: "...",
  fts5: true,
  fts5vocab: true,
  trigramTokenizer: true,
  returning: true,
  batch: true,
  transaction: true,
  cancellation: false,
}
```

The engine computes:

```text
effectiveCapabilities =
  backend base semantics
  ∩ runtime/adapter support
  ∩ probe result
  ∩ application policy
```

Examples:

- `trigramTokenizer: false` disables FTS5 typo candidate fallback even if backend code knows how to compile it;
- D1 policy can disable fuzzy fallback despite a positive tokenizer probe;
- adapter transaction support does not imply search read-your-writes.

Store only safe environment metadata; never secrets.

## SQL statement representation

Use a backend-neutral bound-statement form:

```ts
interface SqlStatement {
  text: string;
  params: readonly SqlValue[];
}
```

Do not pass adapter-specific prepared-statement objects through core.

## Transactions

The API distinguishes:

- adapter can execute a database transaction;
- linked trigger writes are included in that transaction;
- search backend/index exposes read-your-writes before commit;
- batch failure/rollback semantics.

These are not equivalent. Turso native FTS currently documents post-commit FTS visibility, while an FTS5 path may have different behavior. Expose this through effective capabilities/operation metadata rather than hiding it.

Create/rebuild atomicity is a separate lifecycle property. v1 assumes maintenance/offline behavior unless tests prove stronger semantics for the exact pair.

## Maintenance APIs

```ts
await index.maintenance.optimize({ strategy: "incremental", pageBudget: 500 });
await index.maintenance.check();
await index.maintenance.rebuild();
```

Backend compiles these into backend-specific operations.

No universal SQL string for maintenance should exist in core.

## Turso-native stability/graduation gate

`@siftlite/turso` is experimental until **both** conditions hold:

1. SiftLite's claimed Tier A/native capabilities pass its compiler, conformance, lifecycle, and remote smoke gates; and
2. the required upstream Turso FTS/index-method contract is considered stable enough for a stable SiftLite package.

If the required upstream API still needs an experimental feature flag, SiftLite may ship the package only with explicit experimental status. Internal test success cannot override upstream API maturity.
