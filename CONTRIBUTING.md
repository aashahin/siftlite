# Contributing to SiftLite

SiftLite is implemented from the v1.2 implementation pack in `docs/`. Architecture
is controlled by accepted ADRs, not by ad-hoc convenience.

## Prerequisites

- [Bun](https://bun.sh) `1.3.14` or later (see `.bun-version`)
- Node.js 20+ is required only for published CLI compatibility tests

## Setup

```bash
bun install
bun run verify
```

`bun run verify` is the required local gate. It runs format, lint, typecheck,
tests, package build, and export checks. Do not hide failures with `|| true`.

## Workspace

The published package set is:

- `@siftlite/core`
- `@siftlite/fts5`
- `@siftlite/bun`
- `@siftlite/d1`
- `@siftlite/libsql`
- `@siftlite/testing`
- `@siftlite/drizzle`
- `@siftlite/prisma`
- `@siftlite/node`
- `@siftlite/cli`

Do not add empty packages to reserve names. Create a package when its
implementation phase begins.

`@siftlite/core` must stay Web/edge-safe. The dependency-boundary test fails if
core imports Node, Bun, D1, libSQL, Drizzle, or Prisma modules.

## Development workflow

1. Read the relevant implementation-pack documents and ADRs.
2. Add or update tests with the behavior.
3. Implement the smallest change that satisfies the contract.
4. Run the smallest relevant suite, then `bun run verify`.
5. Keep commits phase-oriented.

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run format` | Write formatter changes |
| `bun run format:check` | Check formatting |
| `bun run lint` | Lint |
| `bun run typecheck` | Typecheck packages and tests |
| `bun run test` | Run `bun:test` |
| `bun run build` | Emit package JS, types, and source maps |
| `bun run check-exports` | Validate published export maps and artifacts |
| `bun run verify` | Full repository gate |

## Releases

Versioning uses [Changesets](https://github.com/changesets/changesets):

```bash
bun run changeset
```

Public packages live under `@siftlite/*`. `0.2.0` is on npm. Publishing stays
owner-gated (`changeset version`, then `changeset publish` or the Release
workflow). Do not publish `examples/` or `experimental/`.

## License

By contributing, you agree that your contributions are licensed under the MIT
License.
