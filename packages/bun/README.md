# `@siftlite/bun`

`bun:sqlite` runtime adapter for SiftLite.

This package owns Bun-specific SQL execution (`query`, `execute`, transactional
`batch`, and `transaction`). It must not leak `bun:*` imports into
`@siftlite/core`.

`batch()` is atomic: a mid-batch failure rolls back earlier statements. Bind
values stay on the portable path (strings, safe numbers, booleans, null, and
`Uint8Array` blobs). BigInt is rejected.
