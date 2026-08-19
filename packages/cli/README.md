# `@siftlite/cli`

Noninteractive SiftLite CLI. Works on Node 20+ and Bun.

```bash
npm i -D @siftlite/cli
npx siftlite help
npx siftlite version
npx siftlite generate --name products --table products --search title --json
```

For a one-off command without a local install:

```bash
npx --package=@siftlite/cli siftlite help
```

In `0.1.0`, `help`, `version`, and `generate` are the functional commands.
`generate` prints companion SQL and seeds the registry as `pending`; the host
must later finalize it with `createIndex` using the same definition.

`check` and `doctor` currently return an error directing callers to the engine
methods because the CLI has no database-adapter loading mechanism yet.
`backfill`, `rebuild`, `merge`, and `drop` are also non-operational placeholders;
they require `--acknowledge` before returning the adapter-required error. Flags
after a subcommand are not subcommand help, so `siftlite check --help` still
runs `check` and exits with an error.
