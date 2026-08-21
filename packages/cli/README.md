# `@siftlite/cli`

Noninteractive SiftLite CLI. Works on Node 20+ and Bun.

```bash
npm i -D @siftlite/cli
npx siftlite help
npx siftlite version
npx siftlite init
npx siftlite check --config ./siftlite.config.mjs
npx siftlite generate --name products --table products --search title --json
```

For a one-off command without a local install:

```bash
npx --package=@siftlite/cli siftlite help
```

## Config

`check` and `doctor` load `./siftlite.config.mjs` or `./siftlite.config.js`, or
the path passed as `--config`. The file is imported dynamically
(`pathToFileURL` + `import()`), so the CLI never opens SQLite itself.

Export:

- `createAdapter()` — returns `SqlAdapter | Promise<SqlAdapter>` from
  `@siftlite/node` (better-sqlite3), `@siftlite/bun` (`bun:sqlite`), or
  `@siftlite/libsql`
- `indexes` — one `defineIndex()` result, an array of definitions, or a
  name-to-definition record

Use `--name` when the config exports more than one index. `--json` prints a
machine-readable `CliResult`. Error findings (`status: "error"`) exit
non-zero.

`init` writes a documented `siftlite.config.mjs` and refuses to overwrite
without `--force`.

`generate` stays flag-based: it prints companion SQL and seeds the registry as
`pending`; the host must later finalize it with `createIndex` using the same
definition.

`backfill`, `rebuild`, `merge`, and `drop` load the same config, require
`--acknowledge` (or `--dry-run`), and call the mutating command handlers.
`--dry-run` prints a plan without writing. `backfill` creates or heals a
pending/missing index via `create()` and refuses a healthy index (use
`rebuild`). `merge` accepts `--page-budget` (positive safe integer; default
`8`). Flags after a subcommand are not subcommand help, so
`siftlite check --help` still runs `check`.
