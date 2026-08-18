# SiftLite

Typed application search for SQLite-family databases.

SiftLite is a TypeScript search layer for SQLite, Cloudflare D1, and
libSQL/Turso. It is not a thin FTS5 wrapper. The product contract is a stable,
typed API for full-text retrieval, filters, sorting, facets, Arabic
normalization, ORM integration, and managed index lifecycle. Bounded typo
tolerance is specified for a later phase and is not implemented.

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
This is not a production-ready 1.0. Bounded typo / fuzzy fallback is not
implemented. Packages are not published until the owner finalizes branding
and package scope.

## Packages

| Package | Role |
| --- | --- |
| `@siftlite/core` | Portable types, planner, ASTs, codecs, scopes |
| `@siftlite/fts5` | SQLite FTS5 backend |
| `@siftlite/bun` | `bun:sqlite` runtime adapter |
| `@siftlite/d1` | Cloudflare D1 runtime adapter |
| `@siftlite/libsql` | libSQL / Turso Cloud FTS5 adapter |
| `@siftlite/testing` | Conformance and testkit utilities |
| `@siftlite/drizzle` | Optional Drizzle companion |
| `@siftlite/prisma` | Optional Prisma companion |

`@siftlite/cli` is not part of this set. Experimental Turso-native FTS lives
under `experimental/` and is not a stable backend.

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
