# Architecture

## Architectural goals

1. Keep the public API independent of FTS5/Tantivy syntax.
2. Separate runtime connection concerns from search-engine semantics.
3. Preserve database-level consistency for linked indexes where the backend supports it.
4. Support portable string and safe-integer application IDs without forcing them into FTS rowids.
5. Keep `core` Web/edge-safe and free from runtime/ORM dependencies.
6. Resolve feature support from backend + runtime + probes + policy, rather than adapter-name conditionals.
7. Separate logical index configuration from backend physical schema/migration classification.
8. Make manual-mode document storage independently rebuildable.
9. Treat create/rebuild as maintenance operations unless atomic concurrent behavior is proven.
10. Make every claimed capability pass shared semantic conformance tests.

## Layer model

```text
┌──────────────────────────────────────────────┐
│ ORM / Framework Ergonomics                   │
│ Drizzle | Prisma | future Kysely             │
├──────────────────────────────────────────────┤
│ Public Search API                            │
│ index definitions | filter AST | responses  │
├──────────────────────────────────────────────┤
│ Search Planner                               │
│ normalize | synonyms | fuzzy policy | limits│
├──────────────────────────────────────────────┤
│ SearchBackend                                │
│ FTS5 | future Turso native FTS               │
├──────────────────────────────────────────────┤
│ Runtime Adapter / SQL Executor               │
│ Bun | D1 | libSQL | generic SQLite           │
├──────────────────────────────────────────────┤
│ Database                                     │
└──────────────────────────────────────────────┘
```

## Critical separation: backend vs adapter

### Runtime adapter

Responsible for how SQL is executed.

```ts
export interface SqlAdapter {
  readonly id: string;
  readonly dialect: "sqlite";
  readonly runtimeCapabilities: RuntimeCapabilities;

  query<T>(statement: SqlStatement): Promise<readonly T[]>;
  execute(statement: SqlStatement): Promise<ExecuteResult>;
  batch?(statements: readonly SqlStatement[]): Promise<readonly ExecuteResult[]>;
  transaction?<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T>;
}
```

It does **not** know how BM25, FTS5, or Turso FTS works.

### Search backend

Responsible for search semantics and DDL/query compilation.

```ts
export interface SearchBackend {
  readonly id: string;
  readonly baseCapabilities: SearchCapabilities;

  resolveCapabilities(ctx: CapabilityResolutionContext): EffectiveCapabilities;
  compilePhysicalManifest(ctx: IndexCompileContext): PhysicalSchemaManifest;
  classifyPhysicalChange(previous: PhysicalSchemaManifest | null, next: PhysicalSchemaManifest): PhysicalChange;

  planCreateIndex(ctx: IndexCompileContext): MigrationPlan;
  planDropIndex(ctx: IndexCompileContext): MigrationPlan;
  planRebuildIndex(ctx: IndexCompileContext): MaintenancePlan;

  compileSearch(ctx: SearchCompileContext): CompiledSearch;
  compileFacets(ctx: FacetCompileContext): readonly SqlStatement[];
  compileMaintenance(action: MaintenanceAction, ctx: IndexCompileContext): MaintenancePlan;
}
```

The engine composes one adapter and one backend.

## Search capabilities

Use capabilities rather than adapter-name conditionals.

A backend declares **semantic/base** support, but the engine computes **effective** support after combining runtime facts, probes, and policy.

```ts
export interface SearchCapabilities {
  fullText: boolean;
  phrase: boolean;
  prefix: boolean;
  weightedRanking: boolean;
  highlight: boolean;
  snippet: boolean;
  filters: boolean;
  sort: boolean;
  facets: boolean;
  typoFallback: boolean;
  vocabulary: boolean;
  nativeVector: boolean;
  cancellation: boolean;
}

export interface CapabilityResolutionContext {
  runtime: RuntimeCapabilities;
  probes: RuntimeProbeResult;
  policy: SearchPolicy;
}

```

The backend interface should expose base capabilities and a resolver/constraints hook rather than pretending its static list is final:

```ts
interface SearchBackend {
  readonly id: string;
  readonly baseCapabilities: SearchCapabilities;

  resolveCapabilities(ctx: CapabilityResolutionContext): EffectiveCapabilities;
  // DDL/query/maintenance compilation methods...
}
```

Examples:

- FTS5 may support trigram in principle while a concrete runtime probe says it is unavailable.
- D1 policy may disable fuzzy fallback despite underlying FTS support.
- an adapter may support transactions while a search backend does not expose pre-commit FTS visibility.

Structured capability details are carried by the effective runtime contract below; feature booleans alone are not the complete effective state.

## Effective runtime contract: features, limits, and consistency

Feature booleans are not sufficient. The planner/compiler needs numeric runtime budgets before it can safely expand filters, synonyms, BM25 arguments, hydration batches, or maintenance work.

```ts
export interface RuntimeSqlLimits {
  maxBindParameters?: number;
  maxFunctionArguments?: number;
  maxColumnsPerTable?: number;
  maxStatementBytes?: number;
  maxLikePatternBytes?: number;
  maxQueryDurationMs?: number;
}

export interface ReadConsistencyCapabilities {
  transactionReadYourWrites: boolean;
  postCommitReadYourWrites: boolean;
  sessionAware: boolean;
  sequentialSessionConsistency: boolean;
  readReplicaEligible: boolean;
}

export interface EffectiveCapabilities {
  readonly features: SearchCapabilities;
  readonly limits: RuntimeSqlLimits;
  readonly consistency: ReadConsistencyCapabilities;
  readonly warnings: readonly CapabilityWarning[];
}
```

Rules:

- runtime limits are adapter facts/probes and may change by platform/version;
- undefined means “not proven”, never “unlimited”;
- the compiler reserves bind/function/statement budget before expanding user-controlled lists;
- application limits such as `maxInValues` are upper policy limits, but the effective maximum is the minimum of policy and remaining runtime budget;
- backend compilers may choose alternate strategies when one legal compilation would exceed a runtime limit;
- a backend feature is disabled/rejected when no safe compilation strategy fits the effective limits.

## Canonical field codecs

The core schema owns portable scalar semantics through canonical built-in codecs. ORM packages only map their schema metadata into these core types. This prevents Drizzle/Prisma runtime representations from leaking into backend storage semantics.

Custom public codecs are deferred until after v1; the initial contract stays intentionally narrow.

## Public package naming

The ecosystem namespace is **SiftLite**:

```text
siftlite
@siftlite/core
@siftlite/fts5
@siftlite/bun
@siftlite/d1
@siftlite/libsql
@siftlite/drizzle
@siftlite/prisma
@siftlite/cli
@siftlite/testing
@siftlite/turso   # experimental until graduation
```

The unscoped `siftlite` package is a convenience entrypoint and should be published only when its re-export/runtime policy is stable. Internal workspace folder names do not define public API compatibility.

## Monorepo layout

Use Bun workspaces.

```text
/
├─ packages/
│  ├─ core/                 # @siftlite/core — types, ASTs, planner, codecs, scopes
│  ├─ fts5/                 # @siftlite/fts5 — FTS5 backend/compiler
│  ├─ bun/                  # @siftlite/bun — bun:sqlite adapter
│  ├─ d1/                   # @siftlite/d1 — Cloudflare D1 adapter
│  ├─ libsql/               # @siftlite/libsql — libSQL adapter
│  ├─ drizzle/              # @siftlite/drizzle
│  ├─ prisma/               # @siftlite/prisma
│  ├─ cli/                  # @siftlite/cli
│  └─ testing/              # @siftlite/testing conformance utilities
├─ experimental/
│  └─ turso-native/         # until capability parity/release quality is reached
├─ examples/
│  ├─ bun-basic/
│  ├─ d1-worker/
│  ├─ drizzle-d1/
│  ├─ prisma-libsql/
│  └─ arabic-catalog/
├─ tests/
│  ├─ conformance/
│  ├─ fixtures/
│  ├─ fuzz/
│  └─ compatibility/
├─ benchmarks/
│  ├─ datasets/
│  ├─ runners/
│  └─ reports/
└─ docs/
```

Do not create a separate package for every small internal concern. Tokenization/normalization/query ASTs should remain within `core` until independent versioning is justified.

## Dependency direction

Allowed:

```text
core <- @siftlite/fts5 <- app composition
core <- adapters
core <- drizzle
core <- prisma
core <- cli
```

Forbidden:

- `core` importing Drizzle/Prisma/D1/Bun;
- backend packages importing ORM packages;
- Drizzle importing Prisma or vice versa;
- core requiring Node `fs`, `path`, `process`, `Buffer`, native addons, or `bun:*` modules.

Repository scripts/tests may use Bun APIs. The published CLI should prefer standard Node-compatible APIs that also run under Bun; Bun-only CLI behavior requires an explicit future support decision.

## Index registry

Maintain a private registry table that tracks both desired logical configuration and backend physical state:

```sql
CREATE TABLE IF NOT EXISTS __sift_registry (
  index_name TEXT PRIMARY KEY,
  physical_index_id TEXT NOT NULL UNIQUE,
  active_generation INTEGER NOT NULL,
  definition_hash TEXT NOT NULL,
  physical_schema_version INTEGER NOT NULL,
  physical_schema_hash TEXT NOT NULL,
  backend TEXT NOT NULL,
  source_table TEXT,
  mode TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

`definition_hash` answers “does runtime configuration differ from the declared index?”. `physical_schema_hash` answers “does the backend's physical search schema differ?”. They are intentionally not the same.

Never trust registry state alone. `check`/`doctor` compare desired definition, backend-produced physical manifest, registry, and actual database schema.

## Schema fingerprint

Use two deterministic concepts.

### Logical definition hash

Canonical JSON may include:

- source table and source-ID field/type;
- linked/manual mode;
- index-level normalizers;
- searchable fields/order/weights;
- prefix/fuzzy policy;
- filter/sort/facet definitions;
- synonym/default matching configuration when treated as index-local configuration;
- logical format version.

This hash detects configuration drift but does **not** itself decide whether a rebuild is required.

### Backend physical manifest/hash

Each backend compiles the logical definition into a canonical physical manifest containing only structures/configuration that affect its stored schema/index state. The backend compares old/new manifests and classifies changes as:

- runtime-only;
- migration-only;
- rebuild-required;
- unsupported.

For example, FTS5 weights can remain query-time and need no physical rebuild, while Turso native FTS may encode weights in index configuration. This difference belongs in backend manifests, not core special cases.

Use a stable cross-runtime hash algorithm. Hashes are drift identifiers, not security primitives.

## Portable source IDs

Core v1 exposes `string | number` IDs, with numeric IDs restricted to finite safe integers. Backends/adapters must preserve the declared logical type. The FTS5 physical compiler maps string IDs to `TEXT`, safe-integer IDs to `INTEGER`, and uses a separate surrogate `doc_id` for FTS rowids.

Do not use ordinary non-STRICT `ANY` as a portable source-ID representation. Do not silently stringify every ID either: logical string `"123"` and numeric `123` are distinct schemas/contracts.

## Internal identifiers

Internal table names must be deterministic but bounded.

Example:

```text
__sift_<safe-index-name>_<physical-id>_g<generation>_docs
__sift_<safe-index-name>_<physical-id>_g<generation>_fts
__sift_<safe-index-name>_<physical-id>_g<generation>_tri
```

Rules:

- index names validated against a conservative identifier grammar;
- actual SQL identifiers always quoted using one shared function;
- never derive identifiers from end-user search requests;
- keep a manifest mapping logical names to physical names;
- do not expose internal physical names as stable public API.

## Physical index identity and generations

Logical configuration hashes are **not** physical object identities.

Each logical index receives a stable internal `physical_index_id`, derived from validated logical identity/namespace and stored in the registry. Physical rebuilds use monotonically increasing generations:

```text
__sift_products_k3f9_g1_docs
__sift_products_k3f9_g1_fts
__sift_products_k3f9_g1_tri

__sift_products_k3f9_g2_docs
__sift_products_k3f9_g2_fts
```

The concepts are distinct:

```text
logical index identity != logical definition hash != physical manifest hash != physical generation
```

A query-time weight/synonym/default-limit change may alter `definition_hash` while retaining the same generation. A rebuild-required change creates a new generation according to the maintenance plan. Internal names must never be derived directly from the current full definition hash.

## Public engine composition

Recommended shape:

```ts
const engine = createSearchEngine({
  adapter: d1Adapter(env.DB),
  backend: sqliteFts5(),
  indexes: [productsIndex],
  policy: {
    fuzzyFallback: "disabled-on-cost-sensitive-runtimes",
  },
  limits: {
    maxQueryLength: 512,
    maxTerms: 32,
    maxLimit: 100,
    maxOffset: 10_000,
    maxFacets: 10,
  },
});

const status = await engine.initialize();
// status.effectiveCapabilities is calculated once/probed/cached according to adapter policy.
```

Adapters may expose convenience factories such as `createD1Search`, but they must compose the same core engine internally rather than introduce a parallel API.

## Error model

Use typed error codes, not message parsing.

Minimum classes/codes:

- `SEARCH_CONFIG_INVALID`;
- `SEARCH_CAPABILITY_UNSUPPORTED`;
- `SEARCH_QUERY_INVALID`;
- `SEARCH_QUERY_LIMIT_EXCEEDED`;
- `SEARCH_FILTER_INVALID`;
- `SEARCH_INDEX_NOT_FOUND`;
- `SEARCH_INDEX_DRIFT`;
- `SEARCH_MIGRATION_REQUIRED`;
- `SEARCH_BACKEND_ERROR`;
- `SEARCH_ADAPTER_ERROR`;
- `SEARCH_MAINTENANCE_FAILED`.

Errors should carry `cause` where supported, but never include secrets or bound values that may contain sensitive data by default.

## Observability hooks

Core should expose callbacks, not own a logging framework:

```ts
interface SearchHooks {
  onQueryStart?(event: QueryStartEvent): void;
  onQueryEnd?(event: QueryEndEvent): void;
  onQueryError?(event: QueryErrorEvent): void;
  onMaintenance?(event: MaintenanceEvent): void;
}
```

Events include index/backend/duration/candidate counts but not raw query text unless the user explicitly enables it.

## Compatibility strategy

The backend contract remains internal until v1.0. Stabilize it with:

1. the full FTS5 implementation; and
2. a pre-v1 experimental Turso-native pressure test that exercises materially different DDL/scoring/capability/maintenance assumptions.

The Turso-native spike need not ship as a stable v1 backend. Its purpose is to prove that public/core contracts, physical manifests, and capability resolution are not accidentally FTS5-specific.

