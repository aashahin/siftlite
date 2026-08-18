# `@siftlite/node`

`better-sqlite3` runtime adapter for SiftLite on Node.js.

`better-sqlite3` is an optional peer. The adapter accepts a minimal database
surface (`prepare`, `exec`) so tests and wrappers do not import the native
module into `@siftlite/core`.
