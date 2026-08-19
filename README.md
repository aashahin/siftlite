# SiftLite

Typed application search for SQLite-family databases.

SiftLite is a TypeScript search layer for SQLite, Cloudflare D1, and
libSQL/Turso. It is not a thin FTS5 wrapper. The product contract is a stable,
typed API for full-text retrieval, filters, sorting, facets, Arabic
normalization, optional bounded typo fallback, ORM integration, and managed
index lifecycle. Typo fallback requires the trigram tokenizer and stays off
on cost-sensitive runtimes such as D1 unless policy enables it.

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

`0.1.0` is published on npm under `@siftlite/*`. This is a pre-v1 release from
the [v1.2 implementation pack](docs/README.md), not a production-ready 1.0.
Bounded typo fallback is implemented behind `typoTolerance.mode: "fallback"`
and stays disabled on D1 by default.

## Install

```bash
npm i @siftlite/core @siftlite/fts5 @siftlite/bun
```

Other adapters: `@siftlite/d1`, `@siftlite/libsql`, `@siftlite/node`.
ORM companions: `@siftlite/drizzle`, `@siftlite/prisma`.
CLI: `npx siftlite` or `npm i -D @siftlite/cli`.

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
| `@siftlite/node` | `better-sqlite3` Node adapter |
| `@siftlite/cli` | check / doctor / generate CLI |

Experimental Turso-native FTS lives under `experimental/` and is not a
stable backend.

## Docs

Public documentation lives in `www/` (Nimbus/Astro) and deploys as a
Cloudflare Worker: <https://siftlite-docs.abshahin.workers.dev>.

```bash
bun run docs:dev
```

The markdown under `docs/` is the internal implementation pack, not the
public site.

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
