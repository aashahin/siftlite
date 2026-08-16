# `@siftlite/bun`

`bun:sqlite` runtime adapter for SiftLite.

This package owns Bun-specific SQL execution. It must not leak `bun:*` imports
into `@siftlite/core`.

Phase 0 exports package identity only.
