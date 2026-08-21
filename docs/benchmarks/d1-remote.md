# D1 remote cost characterization

Generated: 2026-08-21T13:43:52.289Z

Skipped: `SIFTLITE_D1_ACCOUNT_ID`, `SIFTLITE_D1_DATABASE_ID`, and
`CLOUDFLARE_API_TOKEN` are not configured.

P12-10 / P14-06 therefore have no remote rows-read or duration evidence.
`D1_DEFAULT_SEARCH_POLICY.typoFallback` remains
`disabled-on-cost-sensitive-runtimes`. Re-run
`bun run scripts/bench-search.ts --d1 --write-report` when credentials exist.
