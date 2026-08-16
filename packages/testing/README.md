# `@siftlite/testing`

Conformance and testkit utilities for SiftLite.

Shared adapter and backend suites live here so each runtime pair is tested
against the same contracts on a real SQL engine, not a mock.

`runSqlAdapterConformance` covers docs/09 §3: parameterized binding, TEXT ID
identity, safe-integer and NULL/BLOB round-trips, BigInt rejection, batch
success/failure, transaction commit/rollback when offered, and SearchError
wrapping. FTS5 search and Arabic corpora are also hosted here.
