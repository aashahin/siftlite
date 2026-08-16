# `@siftlite/core`

Portable, runtime-neutral SiftLite contracts.

This package is **Web/edge-safe**. It must not import Node, Bun, D1, libSQL,
Drizzle, or Prisma APIs.

Public surface includes:

- source IDs (`string | safe-integer number`)
- canonical field codecs and storage kinds
- logical index definitions and definition hashes
- filter and text-query ASTs
- portable plain-text parser
- immutable bound scopes
- application limits, runtime SQL limits, and statement budgets
- effective capability resolution
