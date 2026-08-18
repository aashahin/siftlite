# `@siftlite/cli`

Noninteractive SiftLite CLI. Works on Node 20+ and Bun.

```bash
siftlite help
siftlite generate --name products --table products --search title --json
siftlite check --help
```

`generate` prints companion SQL. `check` and `doctor` require an adapter
factory from the host application; they fail closed if no database is supplied.
Destructive commands require `--acknowledge`.
