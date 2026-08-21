# `@siftlite/d1`

Cloudflare D1 runtime adapter for SiftLite.

This package is a **runtime adapter**. Search semantics stay in `@siftlite/fts5`.
Core never imports D1 types.

## Limits

Documented D1 per-query limits (revalidated 2026-08-16 from
[D1 platform limits](https://developers.cloudflare.com/d1/platform/limits/)):

| Limit | Value |
| --- | --- |
| Bound parameters | 100 |
| SQL function arguments | 32 |
| Statement size | 100,000 bytes |
| LIKE/GLOB pattern | 50 bytes |
| Query duration | 30 seconds |
| Columns per table | 100 |

The adapter exposes these as `runtimeCapabilities.limits`. Compilers must reserve
budget before D1 receives an invalid statement.

## Consistency

A plain `D1Database` binding is **not** session-aware. Cloudflare currently
documents non-session queries as primary-only and requires Sessions to use read
replication. `readReplicaEligible` is `false` on `d1Adapter` and `true` on
`d1SessionAdapter`. A plain binding does not promise post-commit
read-your-writes or cross-request session continuity.

Use `d1SessionAdapter(db, bookmark)` to wrap
[`withSession()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession):

- `first-unconstrained` — first query may use any instance
- `first-primary` — first query goes to primary
- a previous session bookmark — sequential consistency from at least that version

`getBookmark()` returns the latest session bookmark, or `null` before any query.

D1 `batch()` is an atomic sequential transaction. Interactive `BEGIN`/`COMMIT`
callbacks are not part of the Worker API, so `transactions` is `false`.

## Typo tolerance

D1 is cost-sensitive. `D1_DEFAULT_SEARCH_POLICY.typoFallback` is
`disabled-on-cost-sensitive-runtimes`. If an index definition requests
`typoTolerance.mode: "fallback"` under that policy, search fails with
`SEARCH_CAPABILITY_UNSUPPORTED` / `typo-fallback-unsupported`; it does not
silently continue as exact-only search. Keep the definition mode `"off"` or
make an explicit enablement and cost decision.

## Export / backup of FTS5 indexes

Current D1 export **does not support databases containing virtual tables**,
including FTS5
([import/export known limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations)).

Supported workaround:

1. Drop derived FTS virtual tables (`__sift_*_fts`, and `__sift_*_tri` if
   typo fallback is enabled).
2. Export the authoritative database (source tables and/or manual document tables).
3. Recreate/rebuild search structures after import.

Linked indexes are derived from source tables. Do not treat FTS virtual tables as
the only backup copy. Manual-mode document tables are ordinary tables and must be
included in backups.

Provider Time Travel, replicas, and backups are outside SiftLite's
search-visibility deletion guarantee.

## Highlight / XSS

Highlighted and formatted strings are **not HTML-safe**. Do not assign them to
`innerHTML` (or equivalent) without sanitizing. Highlighting is off by default;
default markers are markdown `**`.

## Usage

```ts
import { d1Adapter, d1SessionAdapter, D1_DEFAULT_SEARCH_POLICY } from "@siftlite/d1";

const adapter = d1Adapter(env.DB);
const session = d1SessionAdapter(env.DB, request.headers.get("x-d1-bookmark") ?? "first-primary");
```
