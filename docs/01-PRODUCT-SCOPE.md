# SiftLite Product Scope and Contracts

## Product objective

SiftLite provides application-quality search for SQLite-family databases through one stable TypeScript API, without requiring a separate search service for the supported use cases.

## Primary users

- TypeScript developers using SQLite locally or in embedded applications.
- Cloudflare Workers applications using D1.
- Applications using libSQL/Turso Cloud.
- Drizzle users who need FTS5 without hand-written virtual-table plumbing.
- Prisma users who need a search layer beside Prisma models.
- Arabic applications that need predictable Arabic normalization.

## Core use cases

### E-commerce / catalog search

- search product name, description, SKU/tags;
- filter by status/category/price;
- sort by price/date;
- return brand/category facets;
- autocomplete prefixes;
- tolerate common spelling mistakes.

### SaaS tenant search

- one database per tenant or shared SQLite database;
- search courses, users, orders, content, or knowledge entries;
- no external Meilisearch synchronization service.

### Documentation/content search

- ranked text search;
- phrase/prefix search;
- snippets/highlights;
- language normalization.

### Local-first / desktop tools

- Bun or SQLite file;
- no daemon;
- embedded index lifecycle.

## Public feature tiers

Capabilities are classified so the library never lies about backend support.

### Tier A — required for every v1 backend

- term search;
- multiple-term search;
- weighted relevance ranking;
- prefix search;
- structured equality/range filters over declared fields;
- sorting over declared fields;
- limit/offset pagination;
- exact facets over declared scalar fields;
- synonyms at query planning time;
- index create/backfill/rebuild/drop;
- capability introspection;
- query limits and safe query compilation.

### Tier B — required for FTS5 v1, capability-gated elsewhere

- phrase queries;
- highlight;
- snippet where available;
- optional trigram fuzzy fallback;
- `fts5vocab` inspection/diagnostics;
- FTS5 optimize/rebuild/integrity maintenance.

### Tier C — post-v1 or backend-specific

- native Turso Database FTS backend;
- vector/hybrid search;
- cursor pagination over relevance ranking;
- geo search;
- related-record indexing;
- composite primary-key linked mode;
- array/multi-value facets;
- custom language stemmers;
- nonportable/codec-based source IDs;
- custom ranking pipelines;
- federated multi-index search;
- search analytics;
- query suggestions based on aggregate user behavior.

## Linked mode vs manual mode

### Linked mode

Use when indexed fields are direct columns of one source table and all configured transforms have a proven portable SQL form.

Properties:

- database triggers maintain the internal search projection;
- direct SQL writes stay synchronized;
- source-primary-key updates are handled explicitly by generated triggers;
- writes are transactionally coupled to FTS5 when the adapter/backend proves that behavior;
- ORM hooks are not required;
- schema changes require generated search migration plans;
- create/rebuild is treated as a maintenance operation in v1 unless safe atomic/concurrent behavior is proven for the exact runtime.

### Manual mode

Use when documents contain joins/relations, nested objects, external data, expensive computed fields, or transforms that cannot be expressed portably in SQL.

Properties:

- caller explicitly calls `upsert`, `delete`, or bulk ingestion APIs;
- a normal internal **manual document table is authoritative** and stores enough source/searchable/metadata state to recreate derived FTS structures;
- the FTS/trigram structures are derived state and may be dropped/rebuilt from that document table;
- the library makes no claim of automatic synchronization with an external application source;
- the same search API applies after ingestion.

Do not silently downgrade linked mode into manual mode.

## Index definition

Canonical ORM-independent concept:

```ts
const productsIndex = defineIndex({
  name: "products",
  source: table("products", {
    primaryKey: { field: "id", type: "string" },
  }),
  mode: "linked",

  // v1 normalization is index-level so query and indexed text use one portable profile.
  normalization: ["arabic-basic"],

  searchable: {
    name: { weight: 5 },
    description: { weight: 1 },
    sku: { weight: 3 },
  },
  filterable: {
    status: "text",
    categoryId: "text",
    price: "number",
  },
  sortable: {
    price: "number",
    createdAt: "integer",
  },
  facets: ["status", "categoryId"],
  prefix: [2, 3],
  typoTolerance: { mode: "fallback" },
});
```

The exact surface syntax may evolve before v1.0, but these concepts must remain distinct: logical definition, source-ID type, index-level normalization, searchable weights, projected metadata, and backend capability policy.

### Portable source-ID contract

```ts
type SourceId = string | number;
```

For v1:

- string IDs are stored in internal `TEXT` columns and must preserve exact text such as leading zeroes;
- numeric IDs must be finite `Number.isSafeInteger()` values and are stored as `INTEGER`;
- `bigint`, BLOB IDs, composite linked keys, and arbitrary codecs are not part of the portable v1 contract;
- internal FTS identity uses a separate surrogate INTEGER `doc_id`.

This restriction prevents cross-runtime coercion/precision bugs, especially on D1's JavaScript binding.

## Portable field storage and scalar codecs

SiftLite v1 does not accept an unconstrained `Scalar = unknown` contract. Every filterable/sortable/facetable field resolves to a canonical storage kind and codec.

```ts
type SearchStorageKind =
  | "text"
  | "safe-integer"
  | "finite-real"
  | "boolean-integer"
  | "timestamp-integer";

interface FieldCodec<TPublic> {
  readonly storageKind: SearchStorageKind;
  encode(value: TPublic): string | number | null;
  decode(value: string | number | null): TPublic;
}
```

v1 built-ins:

- `string` -> SQLite `TEXT`;
- safe integer -> `INTEGER`;
- finite non-integer number -> `REAL`;
- boolean -> `INTEGER` (`0`/`1`);
- timestamp only when the definition explicitly declares an integer unit such as Unix milliseconds.

Do not infer timestamp representation from JavaScript `Date`. Do not accept `bigint`, Decimal, BLOB, arbitrary JSON/object values, NaN, or Infinity in the portable v1 contract.

## Immutable application scope

Shared-database SaaS deployments may bind an index handle to a mandatory scope:

```ts
const tenantProducts = engine.index(productsIndex).scope({ tenantId });
```

Conceptually the scope becomes a compiler-owned predicate such as `tenant_id = ?`. It is always ANDed with user filters and **cannot** be removed, negated, or overridden by the request. The scope applies consistently to hits, facets, fuzzy candidate retrieval, hydration, and any document-reading diagnostic that claims scoped behavior.

A caller may also choose per-tenant databases, in which case the database itself is the isolation boundary. SiftLite must not blur these two models.

## Search request model

```ts
const index = engine.index(productsIndex);

const response = await index.search("ايفون برو", {
  filter: and(
    eq("status", "active"),
    lte("price", 50_000),
  ),
  sort: [relevance(), asc("price")],
  facets: ["categoryId"],
  highlight: ["name"],
  limit: 20,
  offset: 0,
});
```

### Response shape

```ts
interface SearchResponse<TDocument = unknown> {
  hits: Array<SearchHit<TDocument>>;
  page: { limit: number; offset: number; hasMore: boolean };
  totalHits?: number; // populated only for an explicit includeTotal request
  estimatedTotalHits?: number; // only when a backend defines/test this estimate
  facets?: Record<string, FacetDistribution>;
  facetStats?: Record<string, { min?: number; max?: number }>;
  query: string;
  processingTimeMs?: number;
  backend: string;
  warnings?: SearchWarning[];
}

interface SearchHit<TDocument> {
  id: string | number;
  score: number | null; // opaque/backend-local; null when relevance is not computed
  document?: TDocument;
  formatted?: Record<string, string>;
}
```

Public scores are **not comparable across backends or index configurations**. Empty-query/field-only browsing returns `score: null` when no relevance score is computed.

### Pagination and totals

The default response must not require an extra exact count query. The preferred page metadata is:

```ts
page: {
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

Exact totals are opt-in:

```ts
await index.search(query, { includeTotal: true });
```

A backend must not populate `estimatedTotalHits` unless its estimate semantics are documented and conformance-tested.

## Query semantics

Default plain-text search never exposes backend grammar.

For ordinary user text:

- validate length/term limits before expensive expansion;
- normalize the query with the index-level normalization profile;
- tokenize into plain terms;
- treat punctuation as text boundaries rather than backend operators;
- apply the configured `matchingStrategy`;
- make the final token prefix-searchable only when autocomplete policy allows it;
- expand normalized synonyms with bounded alternatives;
- compile a backend-neutral query AST;
- escape backend-special characters in the backend emitter.

Field-specific normalization profiles are deferred from v1 linked mode because they require multiple query-normalization variants or field-specific planning. Separate logical indexes/manual mode may be used when materially different analyzers are required.

Advanced backend syntax is explicitly opt-in and non-portable:

```ts
index.searchRaw(fts5.raw('title:"exact phrase" AND body:sqlite'));
```

Raw mode is branded/namespaced by backend and never overloaded onto ordinary string search.

## Matching strategies

v1 supports:

- `all`: all normalized query terms are required;
- `any`: any term may match, with ranking favoring more matched terms where feasible;
- `last-prefix`: like `all`/`any` but last token is a prefix.

A Meilisearch-style adaptive term-dropping strategy can be added later only after its ranking behavior is specified and tested.

## Filters

Only declared fields may be filtered.

Required operators:

- `eq`, `neq`;
- `gt`, `gte`, `lt`, `lte`;
- `in`, `notIn`;
- `isNull`, `isNotNull`;
- `and`, `or`, `not` for the **filter AST**.

Do not accept a general SQL filter string in the canonical API.

### NULL semantics

v1 follows portable SQL three-valued behavior:

- `eq(field, value)`/range comparisons match only non-NULL values satisfying the comparison;
- `neq(field, value)` does **not** implicitly include NULL rows;
- `in`/`notIn` do not use NULL as a magic value and request arrays containing NULL are rejected;
- `notIn` does not match NULL rows;
- use `isNull`/`isNotNull` explicitly when NULL membership matters.

These semantics must be conformance-tested identically across Bun SQLite, D1, and libSQL.

## Sorting

Only declared sortable fields are allowed. Relevance is the default primary sort.

Allow:

```ts
sort: [relevance(), desc("createdAt")]
```

and explicit field-only sorting:

```ts
sort: [asc("price")]
```

The engine must enforce deterministic tie-breaking with internal `doc_id` or source ID.

## Facets

v1 facets are deliberately simple and portable:

- declared scalar `TEXT`/`INTEGER`/`REAL` fields only;
- exact counts by default;
- configurable maximum distinct values per facet;
- optional min/max statistics for numeric facets;
- **conjunctive semantics**: a facet query uses the same text query and the complete filter set used by hits, including a filter on that same facet field;
- NULL values are excluded from facet buckets in v1.

Do not implement array facets, disjunctive/self-excluding facets, or NULL buckets in v1.

## Index lifecycle commands

The lifecycle/tooling surface is:

```text
search init
search generate
siftlite check
search doctor
search backfill
search rebuild
search optimize
search drop
```

`generate` and `check` are implemented early with the migration/lifecycle layer because Drizzle and Prisma integrations depend on them. The remaining operational commands are completed later in the roadmap.

Migration-first behavior is mandatory: generated production DDL is inspected/applied through the application's migration workflow rather than executed implicitly during normal startup.

## Non-goals for v1

- network search server;
- HTTP API product;
- admin dashboard;
- cluster replication;
- sharding;
- cross-database federation;
- Elasticsearch DSL compatibility;
- Meilisearch API compatibility;
- guaranteed identical relevance across FTS5 and Turso FTS;
- custom C/WASM tokenizer requirement;
- vector embeddings;
- zero-downtime rebuild guarantees;
- AI reranking.

## Compatibility promise

Starting at v1.0:

- public TypeScript API follows semantic versioning;
- internal SQL table names are versioned and considered private;
- migration manifests contain a schema format version;
- backend capability additions are non-breaking;
- removing a capability from a previously supported adapter is breaking unless caused by a documented upstream regression.
