# Research Sources and Upstream Facts

Review date: **2026-08-16**.  
Implementation agents must re-check official upstream documentation before relying on version-sensitive behavior.

## SQLite FTS5

Official documentation: https://www.sqlite.org/fts5.html

Validated facts used by this plan:

- FTS5 is a SQLite virtual-table module.
- FTS5 tables have implicit integer rowids.
- prefix indexes are supported.
- built-in tokenizers include `unicode61`, `ascii`, `porter`, and `trigram` in SQLite builds that include those FTS5 capabilities.
- Porter stemming is designed for English.
- trigram supports substring-style matching.
- BM25 is built in; better FTS5 BM25 matches are numerically lower in SQLite's implementation.
- hidden `rank` may be more efficient for ordered retrieval than invoking `bm25()` directly.
- `highlight()` and `snippet()` are built in.
- `fts5vocab` exposes vocabulary/index information.
- external-content tables require explicit consistency maintenance and have documented pitfalls.

### FTS5 maintenance and deletion facts used by v1.2

- FTS5 `optimize` merges the full index and may take a long time.
- FTS5 `merge` can divide optimization into bounded page-oriented steps.
- FTS5 has a persistent `secure-delete` option; its default is off.
- without FTS5 secure-delete, old full-text entries may remain until merge operations and can be reconstructible to an attacker with SQL access.
- FTS5 secure-delete is distinct from SQLite core `PRAGMA secure_delete`, and neither should be confused with hosted-provider backup/time-travel erasure.
- FTS5 trigram tokenization uses contiguous three-character sequences; full-text trigram queries shorter than three Unicode characters do not match normally.

## SQLite typing / STRICT / ANY

Official documentation: https://www.sqlite.org/stricttables.html

Validated facts:

- `ANY` in a STRICT table preserves the received storage class/value without ordinary affinity coercion.
- `ANY` in an ordinary non-STRICT table can coerce strings that look numeric into numeric values.
- therefore a portable identifier mapping must not rely on non-STRICT `ANY` preserving distinctions such as `"000123"` versus `123`.

Project consequence: v1 uses typed `TEXT` or `INTEGER` source-ID columns rather than generic non-STRICT `ANY`.

## SQLite Unicode limitations relevant to normalization

SQLite core documentation/FAQ: https://www.sqlite.org/faq.html

Project consequence:

- do not assume generic Unicode NFC/NFKC normalization can be expressed identically in standard SQLite SQL across hosted runtimes;
- linked-mode normalizers must be built from explicitly proven portable SQL operations;
- `arabic-basic` therefore uses finite replacement/removal tables rather than relying on a generic Unicode normalization primitive.

## Cloudflare D1

SQL support: https://developers.cloudflare.com/d1/sql-api/sql-statements/  
Worker API: https://developers.cloudflare.com/d1/worker-api/  
Limits: https://developers.cloudflare.com/d1/platform/limits/  
Pricing: https://developers.cloudflare.com/d1/platform/pricing/  
Local development: https://developers.cloudflare.com/d1/best-practices/local-development/  
Import/export: https://developers.cloudflare.com/d1/best-practices/import-export-data/  
Read replication / Sessions: https://developers.cloudflare.com/d1/best-practices/read-replication/  
Workers Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/

Validated facts:

- D1 supports SQLite FTS5 and `fts5vocab`.
- at the 2026-08-16 review, D1 documents finite per-query limits including 100 bound parameters, 32 SQL-function arguments, 100 KB statement length, 50-byte LIKE/GLOB pattern length, and 30-second maximum SQL query duration; implementation must re-check these at release time.
- D1 read replication requires the Sessions API to use replicas; Sessions/bookmarks provide sequential-consistency semantics for a logical session.
- Cloudflare recommends its Workers Vitest integration for most Worker tests; it runs tests inside the Workers runtime.
- Worker API supports prepared/bound statements and batch operations.
- local D1 testing should use Cloudflare's actual local tooling/runtime.
- D1 usage/pricing includes rows-read/rows-written/storage considerations.
- D1 internally supports signed 64-bit INTEGER, but its Worker JS API does not currently support BigInt; JS integers are only exact through `Number.MAX_SAFE_INTEGER`.
- D1 export is not supported for databases containing virtual tables; FTS5 virtual tables must currently be removed before export and recreated afterward.
- a running D1 export blocks other database requests according to current documentation.

Project consequences:

- portable numeric source IDs are safe integers only;
- linked search indexes remain rebuildable derived state;
- operational docs must disclose the virtual-table export workflow.

## Turso / libSQL

libSQL: https://docs.turso.tech/libsql  
TypeScript SDK: https://docs.turso.tech/sdk/ts/quickstart  
SQLite extensions: https://docs.turso.tech/features/sqlite-extensions  
Turso Database FTS: https://docs.turso.tech/sql-reference/functions/fts  
Experimental/index method example: https://docs.turso.tech/guides/code-indexing  
Compatibility: https://docs.turso.tech/sql-reference/compatibility

Validated facts:

- libSQL remains a production SQLite-compatible path and can run on Turso Cloud.
- Turso Database is a distinct newer SQLite-compatible engine.
- `@libsql/client` is the intended v1 adapter path for libSQL/legacy Turso Cloud workloads.
- Turso Database native FTS is Tantivy-powered and distinct from SQLite FTS5.
- native Turso FTS uses `CREATE INDEX ... USING fts`, `fts_match`, `fts_score`, and `fts_highlight`.
- at the 2026-08-16 review, current Turso examples for the index-method FTS path still show `experimental: ["index_method"]`; stable-package graduation must re-check upstream maturity.
- its tokenizer/configuration/maintenance semantics differ from FTS5.
- current native FTS documentation describes post-commit visibility behavior and `OPTIMIZE INDEX` maintenance.
- weights can be part of the native FTS index configuration, reinforcing the need for backend-specific physical manifests.

## Drizzle ORM

Migrations: https://orm.drizzle.team/docs/migrations  
Cloudflare D1: https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1

Validated project assumptions:

- Drizzle supports SQL migration workflows and D1.
- custom/raw SQL migration content is an appropriate path for virtual tables/triggers outside a schema DSL.
- implementation must rely only on supported/public schema metadata surfaces and maintain an explicit compatibility matrix.

## Prisma

Client Extensions: https://www.prisma.io/docs/orm/prisma-client/client-extensions  
Model extension methods: https://docs.prisma.io/docs/orm/prisma-client/client-extensions/model  
TypedSQL: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql  
Raw SQL: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries

Validated project assumptions:

- Client Extensions can add model methods.
- Prisma provides raw/TypedSQL paths for SQL outside ordinary model operations.
- companion search migrations/services can coexist without modeling FTS virtual tables as normal Prisma models.

## Bun SQLite

Official docs: https://bun.com/docs/runtime/sqlite

Validated facts:

- Bun provides built-in `bun:sqlite`.
- prepared statements and transactions are supported.
- extension loading exists, but v1 does not require dynamic/custom extension loading.

## Meilisearch — comparison reference only

Filtering/sorting/faceting: https://www.meilisearch.com/docs/capabilities/filtering_sorting_faceting/overview  
Typo tolerance internals: https://www.meilisearch.com/docs/resources/internals/typo_tolerance  
Ranking internals: https://www.meilisearch.com/docs/resources/internals/ranking

Validated comparison facts:

- Meilisearch exposes application-search concepts such as filterability/sortability/faceting.
- its typo tolerance is materially more sophisticated than the v1 bounded fallback designed here.
- its ranking is multi-criteria rather than simply raw BM25.

These sources inform product semantics only. Meilisearch API/protocol/ranking parity is explicitly not a target.

## Existing small project example

Scout SQLite: https://github.com/JayJamieson/scout-sqlite

It demonstrates that FTS5 index/trigger generation already exists as a small-tool niche. The project must therefore differentiate through application-search semantics, backends/adapters, ORM types, Arabic support, lifecycle/maintenance, facets/ranking, and conformance quality.
