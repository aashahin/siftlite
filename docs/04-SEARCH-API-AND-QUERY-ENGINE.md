# Search API and Query Engine

## Design objective

Users should think in application-search concepts, not FTS5 grammar.

## Core API

Illustrative API:

```ts
const engine = createSearchEngine({
  adapter,
  backend,
  indexes: [productsIndex],
});

const products = engine.index(productsIndex);

const result = await products.search("iphone pro", {
  filter: and(
    eq("status", "active"),
    between("price", 10_000, 50_000),
  ),
  facets: ["brand"],
  sort: [relevance(), desc("createdAt")],
  highlight: ["name"],
  limit: 20,
});
```

## Strongly typed index handle

`engine.index(definition)` carries schema information into request/result types:

- filter keys only from `filterable`;
- sort keys only from `sortable`;
- facet keys only from declared facets;
- highlight keys only from searchable fields;
- source ID type is inferred as `string` or safe-integer `number` when known.

Runtime validation remains mandatory even when TypeScript types exist. Numeric source IDs are rejected if not finite safe integers.

## Query pipeline

```text
raw user text
   |
limits validation
   |
index-level normalization
   |
plain-text tokenization/parser
   |
bounded synonym expansion
   |
matching strategy
   |
backend-neutral TextQuery AST
   |
backend compiler
   |
parameterized SQL + escaped backend search expression
   |
execute exact/prefix path
   |
optional policy/capability-gated fuzzy fallback
   |
hydrate / format / response
```

The query is normalized once using the v1 index-level normalization profile. Field-specific normalization plans are intentionally not part of linked-mode v1.

## Portable parser vs backend lexical analyzer

SiftLite owns the **portable query parser**, not a universal tokenizer clone.

The portable parser is responsible for:

- request/query size limits;
- phrase intent and prefix intent;
- safe AST construction;
- bounded synonym expansion;
- explicit matching strategy;
- rejecting unsupported operators.

The backend lexical analyzer/tokenizer remains responsible for its actual token boundaries and normalization rules. JavaScript code must not claim byte-for-byte equivalence with FTS5 `unicode61` or a Tantivy analyzer unless that equivalence is deliberately implemented and tested.

## Query AST

Do not pass free-form backend query strings between planner and backend when typed intent can represent the request.

```ts
type TextQuery =
  | { kind: "term"; value: string; field?: string; prefix?: boolean }
  | { kind: "phrase"; terms: readonly string[]; field?: string }
  | { kind: "and"; children: readonly TextQuery[] }
  | { kind: "or"; children: readonly TextQuery[] };
```

Ordinary `.search(text)` generates this AST. A unary text `NOT` node is deliberately omitted from the portable v1 text-query contract because backend grammars/standalone-negation semantics differ. Negative structured predicates remain available in the filter AST.

Advanced backend-specific users may opt into branded raw syntax separately.

## FTS5 query compiler

Rules:

- use SQL bind parameters for the final `MATCH` value;
- quote/escape FTS5 string literals centrally;
- never concatenate raw user text with `AND`, `OR`, `NEAR`, `*`, column selectors, quotes, or any backend operator;
- generate prefix `*` only from AST metadata;
- map field names only from compile-time validated index schema;
- field weights belong in ranking configuration, not user query strings.

## Turso-native compiler

Turso native uses a Tantivy query parser. Its grammar is not identical to FTS5. Compile the same portable AST subset into its syntax; do not reuse FTS5 escaping. Unsupported AST nodes/features must be rejected by effective capability/compile validation rather than approximated silently.

## Ranking contract

### Public guarantee

- higher-ranked hits appear first unless field-only sorting is requested;
- configured weights influence relevance where effective capabilities support them;
- exact/prefix normal results outrank fuzzy-fallback groups by default
  (shipped `fallback` mode always-merges: exact/prefix hits first, then
  fuzzy-only survivors by edit distance);
- score values are opaque and backend-local;
- `score` is `null` when relevance is not computed.

### FTS5

Use BM25/hidden `rank` efficiently. SQLite FTS5 uses lower native BM25 values for better matches. If public API exposes higher-is-better numbers, conversion must be monotonic and tested. Do not normalize scores across backends.

### Weighting and physical manifests

```ts
searchable: {
  title: { weight: 5 },
  tags: { weight: 3 },
  body: { weight: 1 },
}
```

Weights are logical configuration. Each backend decides whether they affect physical schema. FTS5 may compile them into query-time BM25 arguments and therefore classify a weight-only change as runtime-only; a different backend may require a physical index migration/rebuild.

Never make core migration logic assume one interpretation.

## Filters

Portable v1 scalar values are storage-safe primitives after field-codec validation:

```ts
type Scalar = string | number | boolean;
```

A `number` must be either the declared safe-integer/timestamp representation or a finite REAL-compatible value for that field. `null` is expressed through `isNull`/`isNotNull`, not as a comparison value. Dates, BigInt, NaN, Infinity, blobs, objects, and arrays are not portable scalar values.

Filter AST:

```ts
type FilterNode =
  | { op: "eq"; field: string; value: Scalar }
  | { op: "neq"; field: string; value: Scalar }
  | { op: "gt" | "gte" | "lt" | "lte"; field: string; value: Scalar }
  | { op: "in" | "notIn"; field: string; values: readonly Scalar[] }
  | { op: "isNull" | "isNotNull"; field: string }
  | { op: "and" | "or"; children: readonly FilterNode[] }
  | { op: "not"; child: FilterNode };
```

Compiler requirements:

- field is declared and maps to compiler-owned SQL metadata;
- values are bind parameters;
- empty `in([])` / `notIn([])` arrays are rejected in v1 rather than compiled into backend-dependent/invalid SQL;
- arrays containing NULL are rejected; callers use `isNull` explicitly;
- NaN/infinite numeric filter values are rejected;
- oversized `IN` arrays/depth/nodes are rejected by limits.

### NULL semantics

v1 follows ordinary SQL comparison behavior:

- comparison operators do not match NULL;
- `neq(field, value)` does not automatically include NULL;
- `notIn(field, values)` does not match NULL;
- `not(eq(...))` is not treated as a magic NULL-inclusive predicate;
- callers use `isNull` or `isNotNull` explicitly.

These rules are part of the cross-backend conformance contract.

## Runtime budget-aware filter compilation

`maxInValues` is an application safety ceiling, not a promise that all of those values fit every runtime query.

The compiler computes the remaining bind budget after reserving parameters for the text expression, scope, other filters, pagination, facets, and backend-specific arguments. It then either:

1. compiles the list within the remaining budget;
2. chunks/uses a backend-supported alternate plan while preserving semantics; or
3. rejects the request with a typed `RuntimeLimitExceededError`.

The same rule applies to function-argument budgets (for example ranking functions), SQL statement byte budgets, and hydration `IN` lists.

## Immutable scope composition

A bound scope is compiler-owned and sits outside the user filter AST:

```text
WHERE (<mandatory scope>) AND (<user filter>)
```

The public filter AST cannot contain an operator that removes or negates the mandatory scope. Scope values are bound parameters and consume runtime bind budget. Facets, totals, empty-query browsing, fuzzy candidate retrieval, and hydration must compile the same scope where relevant.

## Sorting

Compile only declared sortable fields.

Tie-breaker:

```text
ORDER BY relevance, requested-sort-fields..., doc_id ASC
```

or field-only sort with deterministic `doc_id` final key.

## Facets

Facet requests aggregate over the **same candidate predicate** as hits.

For v1, facets are **conjunctive**: the facet query includes the complete active filter tree, including a filter on the same facet field.

Illustrative FTS5 query:

```sql
SELECT d.category_id AS value, COUNT(*) AS count
FROM __sift_products_docs d
JOIN __sift_products_fts f ON f.rowid = d.doc_id
WHERE __sift_products_fts MATCH ?
  AND ...all active filters...
  AND d.category_id IS NOT NULL
GROUP BY d.category_id
ORDER BY count DESC, value ASC
LIMIT ?;
```

Rules:

- compile actual identifiers from validated metadata;
- NULL buckets are excluded in v1;
- numeric facet stats use the same predicate;
- cap facets and values per facet;
- skip aggregate queries when no facets are requested;
- batch independent facet queries on D1 where beneficial;
- add B-tree indexes for declared/high-use facet fields;
- benchmark D1 rows-read cost separately.

Disjunctive/self-excluding facets and NULL buckets are post-v1 features.

## Empty query / placeholder search

Support deliberate browsing:

```ts
index.search("", { filter, sort, facets })
```

Behavior:

- no FTS predicate;
- query the projection/manual document table directly;
- relevance sorting is rejected/omitted unless the API explicitly falls back to a documented deterministic field order;
- `hit.score === null` because relevance is not computed;
- filters/sort/facets continue to work;
- all limits still apply.

This is catalog browsing, not an unbounded “match everything” FTS query.

## Prefix search and autocomplete

FTS5 supports prefix indexes. Index configuration may declare:

```ts
prefix: [2, 3]
```

Do not generate excessive prefix lengths by default because each extra prefix index increases storage/write cost.

Autocomplete policy:

- only last query term becomes prefix by default;
- minimum prefix length configurable, default 2;
- max query terms still applies;
- empty one-character broad searches may be disabled.

## Synonyms

v1 synonyms are query-time and index-local:

```ts
synonyms: {
  iphone: ["ايفون", "آيفون"],
  course: ["دورة", "كورس"],
}
```

Requirements:

- normalize synonym keys/values using same query profile;
- cap alternatives per term and total expanded terms;
- preserve exact original term preference in ranking where feasible;
- detect cycles;
- no implicit global shared mutable synonym registry.

Synonym updates should not force a reindex in v1.

## Highlighting

Two modes:

1. backend-native highlight for identity-normalized text;
2. portable original-text highlighter for normalized/fuzzy matches when implemented.

Security rule: formatted output is **text with caller-selected markers, not trusted HTML**. The library must not claim XSS safety if the caller inserts it as raw HTML.

Default: no highlighting unless requested.

## Snippets

Capability-gated.

FTS5 supplies `snippet()`. Turso native currently does not. The public API should either:

- return `snippet` only when supported; or
- use a portable application-side snippet implementation after hydrated text is available.

Do not fake native snippet capability in backend metadata.

## Pagination

v1:

- `limit` and `offset`;
- strict maximums;
- deterministic tie-breaker.

Do not promise efficient deep pagination. Expose a warning or reject offsets above a configured maximum.

Cursor pagination is a post-v1 feature because relevance scores can change when the index changes.

## Hydration

Canonical search returns source IDs/search metadata. Optional hydrators attach source records.

```ts
const result = await products.search("...", { hydrate: true });
```

ORM integrations hydrate with a bounded `IN (...)` query (chunked if required), then restore search order in memory. Never issue one ORM query per hit.

Hydration must preserve declared source-ID type. Do not coerce string IDs to numbers or unsafe numeric IDs to strings as a hidden transport workaround.

## Limits defaults

Suggested initial safe defaults, configurable by application:

```ts
{
  maxQueryLength: 512,
  maxTerms: 32,
  maxLimit: 100,
  defaultLimit: 20,
  maxOffset: 10_000,
  maxFacets: 10,
  maxFacetValues: 100,
  maxFilterDepth: 8,
  maxFilterNodes: 64,
  maxInValues: 100, // policy ceiling; effective value is constrained by runtime bind budget
  maxSynonymExpansion: 64,
  maxFuzzyCandidates: 200,
}
```

These values are starting safety limits, not performance guarantees. Benchmark and adjust before v1.0.

## Diagnostics mode

Diagnostics are opt-in and must not change search semantics:

```ts
meta?: {
  backend: string;
  runtime: string;
  fuzzyUsed: boolean;
  candidatesExamined?: number;
  bindParametersUsed?: number;
  warnings?: readonly SearchWarning[];
}
```

Do not expose raw user data or sensitive bound values in diagnostics. Query plans/SQL are development-only surfaces and must be clearly separated from normal production response payloads.
