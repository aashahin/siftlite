# Indexing, Storage, Migrations, and Consistency

## Design requirements

The storage/lifecycle design must support:

- portable application IDs that are exact strings or safe integers;
- a separate surrogate integer `doc_id` for FTS row identity;
- linked indexes that stay synchronized after raw SQL and source-primary-key updates;
- manual indexes whose authoritative document state survives FTS corruption/rebuild;
- filtering/faceting without unnecessary application-table scans;
- highlighting/searchable content;
- deterministic logical and physical manifests;
- safe migration/rebuild/drift detection;
- D1/libSQL/Bun compatibility without relying on nonportable SQLite typing tricks.

## Default FTS5 linked-index design

For each logical linked index create:

1. an internal metadata/projection table;
2. a contentful FTS5 table;
3. an optional trigram companion table only when the effective capability/policy permits it;
4. source-table triggers;
5. supporting B-tree indexes on declared filter/sort/facet fields.

### Why not map application IDs directly to FTS rowid?

FTS5 uses an integer `rowid`, while application IDs may be text/UUID-like strings. Therefore use an internal surrogate integer `doc_id`.

### Portable source-ID representation

The index definition declares the ID type. Generate **one** of these physical shapes:

```sql
-- String/UUID-like ID
CREATE TABLE __sift_products_docs (
  doc_id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  status TEXT,
  category_id TEXT,
  price REAL,
  created_at INTEGER
);
```

or:

```sql
-- Numeric ID: application layer guarantees finite safe integer
CREATE TABLE __sift_products_docs (
  doc_id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL UNIQUE,
  status TEXT,
  category_id TEXT,
  price REAL,
  created_at INTEGER
);
```

Do not use ordinary non-STRICT `ANY` for the portable ID contract. It can coerce numeric-looking strings. Do not silently stringify numeric IDs either: string and numeric IDs are distinct declared schemas.

The adapter validates numeric IDs before binding so values outside JavaScript's safe-integer range cannot be silently rounded.

### FTS table

For identity-normalized fields:

```sql
CREATE VIRTUAL TABLE __sift_products_fts USING fts5(
  name,
  description,
  sku,
  prefix='2 3',
  tokenize='unicode61'
);
```

Its `rowid` equals `projection.doc_id`.

For normalization that changes indexed text, the compiler may create normalized/search columns and retain original text only when required for hydration/highlighting. Storage duplication must be explicit and benchmarked.

## Trigger strategy

Generated triggers maintain the entire linked projection transactionally to the extent proven by the runtime.

### Source insert

1. insert the declared source ID and projected metadata, obtaining `doc_id`;
2. insert normalized searchable text into FTS with `rowid = doc_id`;
3. populate optional derived companion structures.

### Source update

Generated trigger predicates must consider:

- searchable fields;
- filter/sort/facet fields;
- **the source primary-key field itself**.

If the source primary key changes, preserve the same internal `doc_id` where practical and update `source_id` using `OLD.<pk>` -> `NEW.<pk>` atomically with the remaining projection update. This path is mandatory in conformance tests.

If searchable/normalization-relevant values change, update the contentful FTS row using ordinary `UPDATE`/`DELETE` semantics supported by the regular FTS table. Avoid external-content special delete protocol in the default implementation.

### Source delete

1. resolve the internal row using the old declared source ID;
2. delete FTS/trigram derived rows;
3. delete the projection row.

Trigger behavior/order must be tested on every supported runtime rather than inferred from one desktop SQLite build.

## Backfill when creating an index

Creating triggers does not index existing rows. Every create-index plan contains a backfill and postconditions.

Conceptual lifecycle:

```text
maintenance boundary
  validate preconditions
  create projection/document structures
  create FTS/supporting indexes
  create triggers (linked mode)
  backfill existing source rows
  verify invariants
  write/update registry hashes LAST
end maintenance boundary
```

### v1 concurrency/atomicity contract

Create and rebuild are **maintenance operations** unless the exact adapter/backend pair proves safe atomic concurrent behavior through tests/documentation.

- Do not claim zero-downtime creation/rebuild in v1.
- For a runtime that proves the entire operation atomic inside one transaction, the adapter may use that stronger behavior and expose it in capability/operation metadata.
- For D1 or remote runtimes where migration execution can leave partial physical objects on failure, generated plans must have explicit preconditions/postconditions and `doctor` must detect/guide cleanup.
- Registry health/hash is written only after verification.
- Application writes should be quiesced for an offline/maintenance rebuild unless the adapter explicitly documents a stronger mode.

This conservative contract avoids a race in which triggers and backfill duplicate/miss concurrent writes.

## Backfill size strategy

### Local SQLite/Bun

- execute set-based `INSERT ... SELECT` where possible;
- for very large datasets, allow chunked backfill to avoid long write locks;
- expose progress through CLI hooks.

### D1

- prefer SQL-side set-based operations when within statement limits;
- otherwise chunk with bounded batches;
- report rows read/written metadata where available;
- do not use one request per row.

### libSQL remote

- batch/chunk writes;
- avoid network round-trip per document;
- provide configurable batch size.

## Normalization in linked mode

Linked mode supports only **index-level** normalizers that have a proven portable SQL implementation.

```ts
interface PortableNormalizer {
  id: string;
  normalize(input: string): string;
  compileSql(inputExpression: SqlExpression): SqlExpression;
}
```

For every fixture:

```text
normalize(input) === SELECT compiled_sql(input)
```

must hold on Bun SQLite, D1 local, and libSQL.

Do not assume generic NFC/NFKC normalization is available in standard SQLite SQL. `arabic-basic` is therefore defined using a finite explicit set of replacements/removals. More powerful transforms are manual-mode-only unless a portable SQL implementation is proven.

Field-specific normalization profiles are deferred from v1 linked mode. If materially different analyzers are needed, use separate logical indexes or manual mode.

## Manual index storage

Manual mode has no source-table triggers. Its **normal document table is authoritative** and contains enough state to rebuild every derived search structure.

Illustrative shape:

```sql
CREATE TABLE __sift_manual_products_docs (
  doc_id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,

  -- searchable document state required to rebuild FTS
  name_source TEXT,
  name_search TEXT,
  description_source TEXT,
  description_search TEXT,

  -- projected metadata
  status TEXT,
  price REAL
);
```

Exact columns are compiler-generated from the index definition. Store original searchable text only where document return/highlighting/rebuild semantics require it; normalized search text must always be reproducible from authoritative manual document state.

Ingestion API:

```ts
await index.upsert([
  {
    id: "p_123",
    searchable: { name: "...", description: "..." },
    filterable: { status: "active", price: 100 },
  },
]);
```

The ingestion transaction/batch updates the authoritative document row first/atomically with its derived FTS row where supported. Bulk operations use adapter batching/transactions and never one remote request per document.

A manual rebuild reads the authoritative document table and recreates FTS/trigram state; it never treats the potentially corrupted FTS index as its only recovery source.

## Schema change handling

Compare canonical logical definitions, then let the **backend physical-manifest compiler** classify physical impact.

### FTS5 examples

Rebuild-required typically includes:

- add/remove/reorder searchable columns when it changes FTS column layout;
- tokenizer change;
- linked normalization change that changes stored indexed text;
- prefix-index configuration change;
- enable/disable trigram companion when implemented as a distinct stored structure.

Projection migration only may include:

- add/remove projected filter/sort/facet columns;
- add/remove supporting B-tree indexes;
- change facet declaration when its storage column already exists.

Runtime-only for FTS5 may include:

- query limits;
- query-time synonyms;
- default matching strategy;
- **BM25 field weights when they are supplied at query time and do not alter the physical FTS schema**.

A different backend may classify the same logical setting differently. For example, native Turso weights may be physical index configuration.

The migration planner must never infer rebuild merely from `definition_hash`. It compares old/new backend physical manifests and returns an explicit, testable classification.

## Zero-downtime rebuild strategy

Not required for the first internal milestone, but design physical names to allow it later:

```text
__sift_products_a_docs
__sift_products_a_fts
__sift_products_b_docs
__sift_products_b_fts
```

Registry points logical index `products` to active generation. A future rebuild can populate generation B and switch registry metadata.

For v1, a locking/offline rebuild is acceptable if clearly documented and tested. Do not implement dual-generation switching until needed.

## Consistency invariants

For linked mode:

1. exactly one projection row per eligible source row;
2. exactly one primary FTS row per projection row;
3. `FTS.rowid == projection.doc_id`;
4. projection `source_id` uniquely identifies the source row and preserves its declared string/integer type;
5. declared filter/sort/facet values match source values after documented coercion/normalization;
6. source-primary-key updates preserve correct source-ID mapping;
7. deleted source rows leave no FTS/trigram entries;
8. physical objects match the active physical-schema manifest/hash.

For manual mode:

1. exactly one authoritative document row per ingested source ID;
2. every primary FTS row maps to one authoritative document row;
3. deleting/rebuilding all derived FTS structures from the authoritative document table produces equivalent search results for the deterministic fixture corpus;
4. ID type/precision rules match the portable contract.

## Doctor checks

`search doctor` operates in levels.

### Fast

- registry exists;
- logical and physical hashes/versions are present;
- required physical tables/triggers/indexes exist;
- source/projection/FTS counts are plausible;
- source-ID physical type matches declared type;
- no obvious partial/stale generation from a failed lifecycle operation.

### Deep

- sample/scan linked source rows and compare projections;
- verify source-primary-key mapping;
- verify FTS returns expected terms for sampled documents;
- verify no orphan `doc_id` values;
- for manual mode, compare authoritative document rows to derived FTS rows;
- run FTS integrity checks when supported;
- report but do not repair automatically unless an explicit fix operation is requested.

## Migration-only projection changes are data migrations

Adding a new projected filter/sort/facet field must not be represented as “DDL only”. The migration planner emits an ordered operation:

```text
preflight / acquire maintenance guard
  -> prepare/add projection storage
  -> backfill existing rows in bounded chunks where runtime requires it
  -> create/recreate required B-tree index
  -> regenerate INSERT/UPDATE triggers to maintain the new field
  -> verify row counts, sampled values, ID types, and trigger behavior
  -> update physical manifest + registry LAST
```

Failure before verification leaves the registry on the previous healthy state and `doctor` reports the partial objects/work. A plan may be resumable but must never silently mark an incomplete backfill as healthy.

## Stable physical identity

Internal table names use the registry's stable `physical_index_id` plus an explicit generation. Logical definition hashes are drift detectors only. Runtime-only logical changes keep the same physical generation; rebuild-required changes may create the next generation.

## Rebuild

`rebuild` is the repair primitive when derived search state or its physical schema is uncertain.

Requirements:

- explicit destructive/maintenance warning;
- dry-run plan;
- no loss/modification of authoritative application source data;
- linked mode rebuilds from the application source table;
- manual mode rebuilds from the authoritative manual document table;
- application writes are quiesced unless the adapter/backend explicitly proves a stronger concurrent-safe mode;
- post-rebuild invariants;
- registry physical/logical hashes updated only after successful verification.

Zero-downtime generation switching is intentionally post-v1.

## Optimize

Backend-specific:

- FTS5: use supported FTS5 optimize/merge commands only through backend maintenance methods;
- Turso native: `OPTIMIZE INDEX` according to its backend implementation;
- D1: measure write/read implications before recommending automatic schedules.

No automatic maintenance loop belongs in core. Applications may schedule it externally.

## Composite IDs

Deferred from v1 linked mode.

Portable v1 supports exactly one scalar source-ID field whose logical type is either:

- `string`, physically stored as `TEXT`; or
- safe-integer `number`, physically stored as `INTEGER`.

Manual mode uses the same portable ID contract in v1. Composite keys, BigInt, BLOB IDs, and caller-defined codecs are post-v1 features requiring explicit cross-runtime serialization/binding tests.

## Budgeted maintenance contract

Full-index maintenance is backend/runtime-specific. The portable API should prefer bounded work:

```ts
await index.maintenance.merge({ pageBudget: 500 });
await index.maintenance.optimize({ strategy: "incremental", pageBudget: 500 });
```

For FTS5, an incremental optimize may be implemented as one negative `merge` step followed by positive bounded `merge` steps until no work remains. A local Bun/SQLite adapter may additionally expose a full optimize path. A remote adapter such as D1 must not assume a single full `optimize` statement is operationally safe merely because FTS5 supports it.
