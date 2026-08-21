# Local 100k search characterization

Generated: 2026-08-21T13:42:32.834Z
Runtime: bun 1.4.0, bun:sqlite
Hardware: unspecified local machine
Rows: 100,000
Database file: `/tmp/siftlite-bench-100k-1787319746366.db` (145.4 MiB)
RSS after search: 81 MiB

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
| Source insert | 100,000 | — | 413 | 413 |
| createIndex backfill | — | — | 4041 | 4041 |
| exact term | 2 | true | 3 | 3 |
| typo fallback | 2 | true | 3 | 4 |
| filtered exact | 20 | false | 225 | 295 |

## D1 default

These numbers are not D1 cost evidence. `D1_DEFAULT_SEARCH_POLICY` stays
`disabled-on-cost-sensitive-runtimes` until a remote D1 report exists.
