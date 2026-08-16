# SiftLite

Typed application search for SQLite-family databases.

SiftLite is a TypeScript search layer for SQLite, Cloudflare D1, and
libSQL/Turso. It is not a thin FTS5 wrapper. The product contract is a stable,
typed API for full-text retrieval, filters, sorting, facets, Arabic
normalization, bounded typo tolerance, ORM integration, and managed index
lifecycle.

```ts
const result = await products.search("ايفون برو", {
  filter: and(eq("status", "active"), lte("price", 50_000)),
  facets: ["brand", "category"],
  limit: 20,
});
```

Consumers should not write FTS5 `MATCH`, Turso `fts_match`, unsafe SQL
fragments, or ORM synchronization hooks.

Highlighted and formatted strings are not HTML-safe; do not assign them to
`innerHTML` without sanitizing. Highlighting is off by default and uses
markdown `**` markers.

## Status

Pre-v1 implementation from the [v1.2 implementation pack](docs/README.md).
Packages are not published until the owner finalizes branding and package
scope.

## Packages

| Package | Role |
| --- | --- |
| `@siftlite/core` | Portable types, planner, ASTs, codecs, scopes |
| `@siftlite/fts5` | SQLite FTS5 backend |
| `@siftlite/bun` | `bun:sqlite` runtime adapter |
| `@siftlite/testing` | Conformance and testkit utilities |

Later phases add `@siftlite/d1`, `@siftlite/libsql`, `@siftlite/drizzle`,
`@siftlite/prisma`, `@siftlite/cli`, and experimental `@siftlite/turso`.

## Development

```bash
bun install
bun run verify
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for scripts, package boundaries, and
release workflow.

## Example

```bash
bun run --filter @siftlite/example-bun-basic start
```

## License

[MIT](LICENSE)
