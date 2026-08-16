# Testing and Benchmark Program

## Quality policy

Tests are the executable enforcement of accepted contracts. A backend/adapter/integration is not supported because it compiles; it is supported only after passing the relevant suite.

If a test contradicts an accepted ADR/normative contract, treat that as a specification/test bug to resolve explicitly rather than silently letting the accidental test redefine architecture.

Use `bun:test` for repository tests unless a package has a demonstrated runtime reason to use a different harness.

## Test layers

### 1. Core unit tests

Cover:

- index-definition validation;
- portable source-ID validation (`string` / safe integer only);
- logical canonicalization/hash;
- backend physical-manifest canonicalization/classification;
- query parser/AST transformations;
- filter AST and NULL semantics;
- limit enforcement;
- synonym expansion/cycle detection;
- index-level normalization;
- effective capability resolution;
- public score conversion/null score semantics;
- response ordering/tie-breaking.

### 2. SQL compiler snapshot + semantic tests

For each backend:

- create/drop/rebuild DDL;
- physical manifest and migration classification;
- trigger DDL including source-ID update;
- search SQL;
- filter/NULL combinations;
- sort/facet SQL;
- prefix/phrase queries;
- maintenance commands.

Snapshots are secondary; semantic runtime tests are authoritative.

### 3. Adapter conformance suite

One shared suite receives an adapter factory. Minimum coverage:

```text
execute/query parameter binding
TEXT ID identity preservation
safe-integer boundary binding
unsupported BigInt/unsafe numeric rejection where portable contract applies
batch success/failure semantics
transaction commit/rollback
NULL/BLOB/text/integer ordinary value binding
error wrapping
concurrent query safety where claimed
runtime probes
```

Only assert optional transaction/cancellation behavior when the effective capability is true.

### 4. Search backend conformance suite

Run the same logical corpus against every claimed backend/runtime pair. Required semantics:

- exact/multi-term all/any;
- phrase when capability true;
- prefix;
- controlled weighted title/body ordering;
- insert/update/delete/source-ID-update consistency;
- scalar/nested filters;
- documented NULL behavior;
- sorting;
- conjunctive facets with NULL excluded;
- empty-query browsing with `score: null`;
- pagination/tie-break;
- highlight/snippet capability behavior;
- rebuild;
- logical/physical drift detection;
- Arabic fixtures where that profile is enabled.

Do not assert identical numeric scores across backends. Assert controlled relative ordering.

### 5. Linked-index mutation matrix

For each runtime:

| Mutation path | Insert | Update | Delete | Source-ID update |
|---|---:|---:|---:|---:|
| direct adapter SQL | required | required | required | required |
| Drizzle | required | required | required | required when ORM permits |
| Prisma | required | required | required | required when ORM permits |
| bulk operation | required | required | required | as applicable |

Search after commit and verify no stale/orphan hits.

### 6. Manual-mode recovery suite

- upsert authoritative documents;
- search expected results;
- deliberately drop/corrupt derived FTS structures;
- rebuild exclusively from authoritative manual document rows;
- verify equivalent deterministic search results and metadata;
- verify backup-relevant normal tables contain document state independently of FTS.

### 7. Migration/lifecycle tests

Fixtures include:

- first index creation/backfill;
- typed string vs integer source-ID physical schema;
- add projected filter field;
- add searchable field -> rebuild;
- FTS5 weight-only change -> no physical rebuild when backend manifest says runtime-only;
- normalization/tokenizer/prefix changes -> expected physical classification;
- enable/disable trigram;
- drop index without source-table damage;
- interrupted/failing create/rebuild;
- partial physical objects with registry not falsely healthy;
- logical hash mismatch vs physical hash mismatch;
- source writes quiesced/explicit maintenance-mode behavior;
- empty table and 100k-row backfill fixture.

### 8. Type tests

Use `tsc --noEmit` fixtures or an equivalent harness.

Drizzle:

- invalid filter field/value type fails;
- valid portable source IDs infer correctly;
- unsupported bigint/composite ID configuration fails clearly;
- hydration result matches table select type target.

Prisma:

- service/extension model typing;
- invalid search field fails;
- hydrated model type;
- supported generated-client forms;
- unsupported bigint/composite ID path does not masquerade as portable support.

### 9. Fuzz/property tests

#### Query parser/emitter

Generate quotes, parentheses, backend operators, punctuation, null bytes where representable, emoji, Arabic punctuation, long combining sequences, and invalid-surrogate edge cases.

Invariant: ordinary user text cannot inject additional query AST operators/backend grammar.

#### Filter compiler

Generate random nested filter ASTs within limits. Verify bound parameter counts and that values never appear as identifiers/SQL literals unexpectedly. Include NULL semantics.

#### Normalization

Generate random Unicode plus curated Arabic corpus. For transforms claimed portable, verify JS/SQL equivalence. Include compatibility/presentation-form samples whose expected v1 behavior is intentionally “not normalized” so scope does not silently expand.

#### CRUD/index consistency

Generate random insert/update/delete/source-ID-update sequences and compare authoritative state to projection/FTS invariants.

#### Source-ID property tests

Include:

- `"000123"`, `"123"`, numeric `123` under their declared schemas;
- empty/long valid strings according to configured limits;
- `Number.MAX_SAFE_INTEGER` and negative safe integers if allowed by source schema;
- unsafe integers, NaN, Infinity, and BigInt rejection at portable boundaries.

## Runtime matrix

Required local CI:

- Bun SQLite;
- D1 local through Wrangler/workerd;
- libSQL local;
- supported Drizzle combinations;
- supported Prisma combinations.

Release CI with secrets when configured:

- D1 remote smoke;
- libSQL/Turso Cloud remote smoke;
- experimental Turso-native smoke during/after the pre-v1 architecture pressure phase.

Do not make stable v1 FTS5 correctness dependent on optional remote credentials. Local required environments must still exercise real runtime implementations rather than substituting unrelated desktop SQLite builds.

## Benchmark datasets

Synthetic alone is insufficient. Use both deterministic generated datasets and redistributable real-ish text fixtures.

Scales:

- `1k` — correctness/dev speed;
- `10k` — small app;
- `100k` — realistic application search;
- `1m` — stress/upper-bound characterization.

Fields:

- short title;
- 100–500 char description;
- category/brand/status;
- numeric price;
- timestamp;
- mixed Arabic/English subset;
- controlled typo queries.

## Benchmark operations

Measure separately:

1. initial index creation/backfill;
2. single insert overhead;
3. batch insert throughput;
4. update/delete overhead;
5. exact term search;
6. 3-term search;
7. prefix search;
8. filtered search;
9. facet search 1/5/10 facets;
10. placeholder browse;
11. fuzzy fallback;
12. rebuild;
13. optimize before/after effects;
14. memory/RSS for local runtimes;
15. D1 rows read/written where metadata allows.

## Benchmark methodology

- warmup iterations;
- fixed random seed;
- record hardware/runtime/database versions;
- report p50/p95/p99 where enough samples exist;
- report index/database size;
- record query result count to prevent dead-code/empty-result benchmarks;
- never compare remote D1/Turso latency directly with local SQLite as if they were equivalent environments.

## Performance gates

Do not set marketing latency/throughput claims before baseline measurement.

Engineering gates:

- no unbounded memory growth beyond expected data/index structures;
- fuzzy fallback never exceeds configured candidate cap;
- search/facet query count is bounded and documented;
- no N+1 hydration;
- D1 facet requests use batching where supported/beneficial;
- source-ID validation adds no per-hit remote query;
- normalizer SQL/trigger cost is measured on write-heavy fixtures;
- maintenance-mode rebuild/backfill memory and lock duration are characterized;
- regression jobs flag meaningful baseline changes while tolerating small noisy variance.

After baselines, establish per-operation budgets by environment. Do not compare remote D1/Turso latency directly with local SQLite as equivalent systems.

## Correctness benchmark guard

Every benchmark query validates expected result IDs/counts for a small deterministic subset. A faster query that returns incorrect results is a failed benchmark.

## Release test command

Target one top-level command:

```bash
bun run verify
```

It should run:

```text
format/check
lint
TypeScript build/typecheck
unit tests
conformance tests
integration tests
migration tests
package build
package export checks
CLI smoke tests
```

Remote smoke/large benchmarks may be separate release workflows.


## Runtime-limit and codec conformance

Every adapter/backend pair must test:

- bind-parameter budgeting at, below, and above the effective limit;
- function-argument budgeting where ranking/configuration uses SQL functions;
- statement-size rejection before execution when it can be predicted;
- application `maxInValues` being reduced by already-reserved bind parameters;
- hydration chunking that preserves result order;
- safe-integer boundaries, finite-real validation, booleans, explicit timestamps;
- rejection of BigInt/NaN/Infinity/arbitrary objects in portable v1 paths.

## Tenant-scope security suite

For shared-database fixtures containing at least two tenants, verify that no cross-tenant row can be observed through:

- normal text search;
- nested AND/OR/NOT filters;
- empty-query browsing;
- facets/stats/totals;
- highlighting/snippets;
- fuzzy fallback;
- hydration;
- diagnostics that return document data.

## D1 real-runtime suite

D1 conformance must run using Cloudflare's Workers Vitest integration so the adapter executes in the Workers runtime with D1 bindings. `bun:test` remains the primary repository/core test runner, but it is not evidence for D1 runtime compatibility.

The D1 matrix contains:

1. deterministic local Workers-runtime tests in CI;
2. optional/credentialed remote D1 smoke tests;
3. a Sessions/bookmark test that demonstrates the declared consistency metadata;
4. runtime-limit fixtures close to documented D1 ceilings;
5. rows-read/rows-written capture for expensive facet/fuzzy benchmark scenarios where remote metadata is available.

## Secure-delete tests

When FTS5 secure-delete is available, test both policy-off and policy-on creation/update/delete behavior and version/probe handling. Do not attempt to claim provider-backup erasure from unit tests.

## Early Turso-native pressure-test evidence

Before deep lifecycle/ORM/fuzzy phases, the experimental Turso-native spike must compile representative logical definitions and queries through a second backend path. The test is successful when FTS5-specific query syntax, rowid assumptions, weights, maintenance operations, and visibility semantics remain isolated behind backend contracts. If remote credentials are unavailable, compiler/manifest fixtures are mandatory and the missing remote evidence is recorded explicitly.
