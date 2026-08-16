# Security, Reliability, and Maintenance

## Threat model

The library processes attacker-controlled search strings and filter values and generates DDL from developer-controlled definitions.

Primary risks:

- SQL injection;
- FTS/Tantivy query-language injection;
- identifier injection through schema metadata bugs;
- resource exhaustion from broad/fuzzy/faceted queries;
- source-ID coercion/precision loss across runtime bindings;
- index/source inconsistency and manual-index unrecoverability;
- partial create/rebuild on remote runtimes;
- migration/physical-manifest drift;
- accidental destructive rebuild/drop;
- leaking sensitive query text in logs;
- XSS misuse of formatted/highlighted output;
- operational surprises from D1 virtual-table export limitations.

## SQL injection rules

1. Every data value is a bind parameter.
2. No user request field is interpolated as an identifier.
3. Identifiers come only from validated index definitions.
4. One identifier quoting implementation is shared by every backend compiler.
5. Raw SQL APIs are never called with string-concatenated user values in library code.

Static tests should grep/AST-check dangerous interpolation patterns in compiler packages where practical.

## Search-language injection

`MATCH ?` protects SQL syntax but not search grammar semantics. User text such as quotes/operators can alter FTS behavior if passed directly.

Therefore:

- ordinary `.search(text)` treats text as plain terms;
- parser builds an AST;
- backend emitter escapes each literal;
- boolean/prefix/field operators are generated from AST nodes;
- raw syntax requires `.searchRaw()` or a branded raw value.

## Raw API

Example:

```ts
const q = unsafeFts5Query('title:"sqlite" AND body:fts5');
await index.searchRaw(q);
```

Name it so risk/non-portability is obvious. Do not overload ordinary string search with an option like `{ raw: true }` that is easy to enable accidentally.

## Source-ID integrity

Source IDs are security/correctness-sensitive keys, not arbitrary convenience values.

- string IDs remain exact strings;
- numeric IDs must be finite safe integers;
- adapters reject unsupported `bigint`/unsafe numeric values before lossy conversion/binding;
- generated internal columns use `TEXT` or `INTEGER` according to the declared source-ID type;
- no ordinary non-STRICT `ANY` source-ID storage in the portable v1 path;
- no hidden stringification to “make an adapter work.”

Type/identity regression fixtures include leading-zero strings and safe-integer boundaries.

## Resource limits

Enforce before SQL compilation:

- query string bytes/chars;
- normalized term count;
- filter tree depth/node count;
- `IN` list length;
- requested limit/offset;
- facets count and values per facet;
- synonym expansion count;
- fuzzy candidate cap.

Return typed limit errors.

## Timeouts and cancellation

Where adapter/runtime supports cancellation, allow an `AbortSignal` in search options.

Do not require adapters to support cancellation if underlying APIs cannot, but report the capability.

## Highlight security

Highlighted/formatted strings are not automatically HTML-safe.

Documentation must state:

- source text may contain HTML;
- marker strings may contain HTML;
- frontend must escape content or use a safe renderer;
- do not call `innerHTML`/equivalent on formatted output without sanitization.

Default highlighting is off.

## Sensitive query logging

Default observability events should include:

- index name;
- backend;
- duration;
- result count;
- filter/facet counts;
- fuzzy fallback yes/no.

Do not include raw query text or bound filter values by default. Provide opt-in redaction/logging hooks.

## Consistency monitoring

### Linked-mode fast checks

- registry logical/physical hashes and versions;
- required table/trigger/index presence;
- source/projection/FTS count relationship;
- declared source-ID physical type;
- obvious stale/partial generations.

### Linked-mode deep checks

- sampled source/projection equality;
- source-primary-key mapping after updates;
- orphan detection;
- FTS integrity commands where supported;
- sampled known-term lookup.

### Manual-mode checks

- authoritative document row count/ID uniqueness;
- FTS rows map to authoritative `doc_id` rows;
- sampled normalized/searchable values agree;
- rebuild-from-document-store produces equivalent deterministic search results.

Never declare a manual FTS table authoritative merely because it contains searchable text.

## Migration safety

Migration plan object contains explicit classification and checks:

```ts
interface MigrationPlan {
  id: string;
  destructive: boolean;
  requiresRebuild: boolean;
  physicalChange: "none" | "migration" | "rebuild" | "unsupported";
  statements: readonly SqlStatement[];
  preconditions: readonly Check[];
  postconditions: readonly Check[];
}
```

Rules:

- logical definition hash and backend physical-schema hash/version are tracked separately;
- backend physical manifests decide whether a stored-schema change is required;
- CLI prints/dry-runs the plan;
- destructive operations in non-interactive mode require an explicit flag;
- never drop application source tables;
- registry health/hashes update last after postconditions;
- failed/partial remote operations remain detectable by `check`/`doctor`.

### v1 lifecycle mode

Create/rebuild is a maintenance/offline operation unless the exact adapter/backend pair proves atomic concurrent behavior. Do not promise zero downtime or attempt silent concurrent backfill/rebuild without a tested generation protocol.

## Recovery model

### Linked mode

Application source data is authoritative; projection/FTS is derived.

```text
source table -> rebuild projection/FTS -> verify -> mark healthy
```

Search-derived tables do not require an independent backup to preserve application data.

### Manual mode

The normal internal **manual document table is authoritative**. It must be backed up with the database when documents cannot be recreated externally.

```text
authoritative manual docs -> rebuild FTS/trigram -> verify
```

Never rebuild a corrupted manual FTS index from itself as the only source.

## FTS5 deletion, privacy, and data remanence

SiftLite distinguishes three claims:

1. **search visibility deletion** — deleted/updated content no longer matches normal SiftLite queries after the write becomes visible;
2. **FTS logical secure deletion** — when supported and enabled, FTS5 removes old full-text entries rather than leaving them recoverable through ordinary SQL access until later merges;
3. **file/provider forensic erasure** — stronger guarantees involving database pages, replicas, backups, or time-travel systems.

Only the first claim is unconditional for normal delete semantics. The second is a capability/policy (`fts5SecureDelete`) and requires a compatible SQLite/FTS5 runtime probe. The third is outside SiftLite's portable guarantee; local SQLite may require the core `secure_delete` setting for file-level concerns, and hosted providers may retain backups/time-travel according to their own policies.

Suggested configuration:

```ts
privacy: {
  fts5SecureDelete: "off" | "required-if-supported";
}
```

If `required-if-supported` is requested and the runtime cannot prove support, index creation/open must fail rather than silently weakening the policy.

Do not document `index.delete(id)` as forensic erasure.

## Immutable tenant scope as a security boundary

For a shared-database SaaS index, a mandatory tenant/application scope must be compiler-owned and impossible for the request filter AST to remove. Security tests must attempt scope bypass through nested `not`, `or`, facet requests, empty-query browsing, fuzzy fallback, hydration, and raw identifiers. Raw backend query mode still retains the mandatory relational scope unless an explicitly privileged API bypasses it.

## Budgeted maintenance on remote runtimes

Maintenance APIs must accept bounded work budgets. A full FTS5 optimize is not the portable default because it may reorganize the entire index. D1 and other remote runtimes should prefer incremental merge plans that can stop/resume and respect runtime duration limits. Registry state distinguishes “healthy with maintenance pending” from “migration/rebuild incomplete”.

## D1 recovery

D1 linked indexes remain reconstructible from authoritative source rows and must not require a platform restore merely to repair search drift.

### Current D1 export caveat

D1 currently does not export databases that contain virtual tables, including FTS5. Operational guidance must follow current Cloudflare documentation at implementation/release time. The documented workaround at this review is:

1. ensure authoritative source/manual document data is backed up and search definitions/migrations are available;
2. remove derived FTS virtual tables as required for export;
3. perform the D1 export;
4. recreate/rebuild search structures from authoritative normal tables.

Because platform behavior can change, implementation agents must re-check official D1 import/export documentation before shipping scripts/docs. Never automate dropping virtual tables without explicit destructive acknowledgement and a verified rebuild path.

## Maintenance scheduling

Core does not run background timers.

Applications may schedule:

- `doctor` checks;
- FTS optimize;
- Turso native `OPTIMIZE INDEX`;
- benchmark/smoke checks.

Document recommended cadence only after benchmarks show value.

## Failure atomicity

Every adapter/backend pair documents/tests separately:

- transaction execution support;
- linked trigger inclusion in a transaction;
- FTS read-your-writes before commit;
- batch rollback/failure semantics;
- create-index atomicity;
- rebuild atomicity;
- whether concurrent application writes are allowed during create/rebuild.

These properties are not inferred from “SQLite compatible.” v1 defaults create/rebuild to maintenance mode when stronger behavior is not proven.

## Concurrency

Local SQLite and remote/serverless concurrency differ. The library should:

- keep linked trigger work minimal;
- avoid application-side read-modify-write index synchronization;
- use DB uniqueness on typed `source_id`;
- explicitly handle source-primary-key updates;
- make bulk indexing batch/transaction aware;
- quiesce writes during maintenance-mode create/rebuild unless a stronger tested mode exists;
- retry only clearly retryable adapter errors with bounded policy;
- never hide infinite retries or duplicate backfill races.

## Dependency security

Keep core dependencies minimal.

Rules:

- no dependency for trivial escaping/AST code;
- pin/review native packages carefully;
- adapters depend on their drivers as peer/optional dependencies when appropriate;
- release CI runs dependency audit and lockfile integrity checks;
- package provenance/signing can be added to publishing pipeline.

## Data privacy

Search index storage duplicates/derives application content. Documentation must make this explicit. Users must not assume removing a source column from API responses removes it from search index storage until a migration/rebuild is applied.

`doctor` should detect stale schema generation; `rebuild` should purge removed indexed fields.

## D1 consistency and replicas

When D1 read replication is enabled, plain post-write reads may not be assumed current. The D1 adapter exposes whether execution uses Sessions/bookmarks and whether sequential consistency/read-your-writes is therefore available for the logical application session. Documentation/examples must show how a caller carries a bookmark/session context when it depends on post-write search visibility.
