# Local 1m search characterization

Generated: 2026-08-21T13:43:52.149Z
Runtime: bun 1.4.0, bun:sqlite
Hardware: unspecified local machine
Rows: 1,000,000
Database file: `/tmp/siftlite-bench-1m-1787319760062.db` (1484.3 MiB)
RSS after search: 90.8 MiB

## Methodology

- Deterministic planted documents `plant-exact` (`iphone 15 pro max`) and
  `plant-typo` (`iphoen 15 pro max`).
- Remaining rows are synthetic widget titles; descriptions are 100–500 chars.
- One linked FTS5 index, typo fallback enabled, default fuzzy policy.
- 1 warmup + 7 timed samples per operation; p50/p95 from those samples.
- Correctness guard: `iphone` must rank `plant-exact` first and still include
  `plant-typo` behind it; `iphoen` must rank `plant-typo` first.
- This is local SQLite. Do not compare these numbers to remote D1/Turso.

## Timings

| Operation | Hits | fuzzyUsed | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| Source insert | 1,000,000 | — | 4275 | 4275 |
| createIndex backfill | — | — | 50428 | 50428 |
| exact term | 2 | true | 4 | 5 |
| typo fallback | 2 | true | 3 | 4 |
| filtered exact | 20 | false | 2212 | 2272 |

## D1 default

These numbers are not D1 cost evidence. `D1_DEFAULT_SEARCH_POLICY` stays
`disabled-on-cost-sensitive-runtimes` until a remote D1 report exists.
